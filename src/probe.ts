import type { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { generateProbes, type Probe } from "./fuzz.js";
import { secretIn, type Tool } from "./lint.js";
import { assessRisks } from "./security.js";
import { openClient } from "./transport.js";

export type Vuln =
  | "crash"
  | "leak"
  | "injection-echo"
  | "weak-validation"
  | "slow"
  | "path-traversal"
  | "command-exec"
  | "ssrf";

export interface ProbeFinding {
  tool: string;
  category: string;
  vuln: Vuln;
  detail: string;
}

export interface ProbeOutcome {
  errored: boolean;
  resultText: string;
  latencyMs: number;
  /** A protocol/transport failure (the server died) — not a normal tool error. */
  crashed: boolean;
}

export interface ProbeReport {
  target: string;
  toolsProbed: number;
  toolsSkipped: number;
  probesRun: number;
  findings: ProbeFinding[];
}

const SLOW_MS = 10_000;

// Confirmed-exploit signatures — these appear in output ONLY if the attack worked.
const PASSWD = /root:.*:0:0:/; // contents of /etc/passwd
const ID_OUTPUT = /uid=\d+\(/; // output of the `id` command
const METADATA = /AccessKeyId|SecretAccessKey|ami-id|instance-id|iam\/security-credentials/i;

/** Pure: classify one probe outcome into vulnerability findings. */
export function analyzeProbe(tool: string, probe: Probe, o: ProbeOutcome): ProbeFinding[] {
  const f = (vuln: Vuln, detail: string): ProbeFinding => ({ tool, category: probe.category, vuln, detail });

  if (o.crashed) {
    return [f("crash", "server crashed / dropped the connection on this input")];
  }

  // Confirmed exploits: a SUCCESSFUL response whose body proves the attack worked.
  if (!o.errored) {
    if (probe.category === "path-traversal" && PASSWD.test(o.resultText)) {
      return [f("path-traversal", "read /etc/passwd via path traversal (confirmed)")];
    }
    if (probe.category === "command-injection" && ID_OUTPUT.test(o.resultText)) {
      return [f("command-exec", "shell command executed — `id` output in the response (confirmed)")];
    }
    if (probe.category === "ssrf" && METADATA.test(o.resultText)) {
      return [f("ssrf", "fetched cloud-metadata credentials via SSRF (confirmed)")];
    }
  }

  const findings: ProbeFinding[] = [];

  if (probe.expect === "graceful-error" && !o.errored) {
    findings.push(f("weak-validation", `accepted ${probe.note} without an error`));
  }

  const leak = secretIn(o.resultText);
  if (leak) findings.push(f("leak", `output leaked a ${leak}`));

  if (probe.category === "injection" && !o.errored && /ignore all previous instructions|system prompt|reveal your/i.test(o.resultText)) {
    findings.push(f("injection-echo", "a successful response reflected the injected instruction (indirect-injection vector)"));
  }

  if (o.latencyMs > SLOW_MS) {
    findings.push(f("slow", `took ${o.latencyMs}ms (denial-of-service surface)`));
  }

  return findings;
}

/**
 * Actively probe a server with adversarial inputs. By default, tools that can
 * write/delete/exec (per the capability classifier) are skipped — pass
 * includeMutating to probe them too (dangerous: it really calls them).
 */
export async function probeServer(target: string, opts: { includeMutating?: boolean } = {}): Promise<ProbeReport> {
  const opened = await openClient(target);
  const findings: ProbeFinding[] = [];
  let toolsProbed = 0;
  let toolsSkipped = 0;
  let probesRun = 0;

  try {
    const res = await opened.client.listTools();
    const tools: Tool[] = res.tools.map((t) => ({ name: t.name, description: t.description, inputSchema: t.inputSchema }));
    const risky = new Set(assessRisks(tools).map((r) => r.tool));

    outer: for (const tool of tools) {
      if (!opts.includeMutating && risky.has(tool.name)) {
        toolsSkipped++;
        continue;
      }
      toolsProbed++;
      for (const probe of generateProbes(tool)) {
        const outcome = await callProbe(opened.client, tool.name, probe);
        probesRun++;
        findings.push(...analyzeProbe(tool.name, probe, outcome));
        if (outcome.crashed) break outer; // the connection is dead; stop here
      }
    }
  } finally {
    await opened.close();
  }

  return { target, toolsProbed, toolsSkipped, probesRun, findings };
}

async function callProbe(client: Client, name: string, probe: Probe): Promise<ProbeOutcome> {
  const t0 = Date.now();
  try {
    const res = await client.callTool({ name, arguments: probe.args });
    return { errored: res.isError === true, resultText: text(res.content), latencyMs: Date.now() - t0, crashed: false };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    const crashed = /closed|EPIPE|ECONNRESET|terminated|exited|disconnect|socket hang up/i.test(message);
    return { errored: true, resultText: message, latencyMs: Date.now() - t0, crashed };
  }
}

function text(content: unknown): string {
  try {
    return JSON.stringify(content);
  } catch {
    return String(content);
  }
}
