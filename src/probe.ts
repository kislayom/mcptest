import type { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { generateProbes, type Probe } from "./fuzz.js";
import { secretIn, type Tool } from "./lint.js";
import { assessRisks } from "./security.js";
import { openClient } from "./transport.js";

export type Vuln = "crash" | "leak" | "injection-echo" | "weak-validation" | "slow";

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

/** Pure: classify one probe outcome into vulnerability findings. */
export function analyzeProbe(tool: string, probe: Probe, o: ProbeOutcome): ProbeFinding[] {
  if (o.crashed) {
    return [{ tool, category: probe.category, vuln: "crash", detail: "server crashed / dropped the connection on this input" }];
  }

  const findings: ProbeFinding[] = [];

  if (probe.expect === "graceful-error" && !o.errored) {
    findings.push({ tool, category: probe.category, vuln: "weak-validation", detail: `accepted ${probe.note} without an error` });
  }

  const leak = secretIn(o.resultText);
  if (leak) findings.push({ tool, category: probe.category, vuln: "leak", detail: `output leaked a ${leak}` });

  // Only a *successful* response that reflects the payload is a real risk (an
  // indirect-injection vector for a downstream agent). The payload appearing in
  // an error message — e.g. "no such file '<payload>'" — is benign reflection.
  if (probe.category === "injection" && !o.errored && /ignore all previous instructions|system prompt|reveal your/i.test(o.resultText)) {
    findings.push({ tool, category: probe.category, vuln: "injection-echo", detail: "a successful response reflected the injected instruction (indirect-injection vector)" });
  }

  if (o.latencyMs > SLOW_MS) {
    findings.push({ tool, category: probe.category, vuln: "slow", detail: `took ${o.latencyMs}ms (denial-of-service surface)` });
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
