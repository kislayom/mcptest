/**
 * SARIF 2.1.0 output — the format GitHub code scanning (and most security
 * dashboards) ingest. Emitting SARIF means a `doctor`/`probe` run surfaces its
 * findings as alerts in the PR's Security tab, not just text in a log.
 *
 * Pure and deterministic: it turns a doctor result and/or a probe report into the
 * SARIF object. The "artifact" is the MCP server target (servers aren't files, so
 * findings carry a logical location — the tool name — rather than a line number).
 */
import type { ProbeReport, Vuln } from "./probe.js";
import type { CheckResult, DoctorResult, Severity } from "./types.js";

export interface SarifInput {
  target: string;
  toolVersion: string;
  doctor?: DoctorResult;
  probe?: ProbeReport;
}

type SarifLevel = "error" | "warning" | "note";

interface SarifResult {
  ruleId: string;
  level: SarifLevel;
  message: { text: string };
  locations: unknown[];
  partialFingerprints: Record<string, string>;
}

const HOMEPAGE = "https://github.com/kislayom/mcpcert";

const RULE_TEXT: Record<string, string> = {
  transport_reachable: "Server must be reachable over HTTP",
  cors_headers: "CORS headers should be present for browser-based clients",
  manifest_valid: "Discovery manifest must be valid JSON",
  manifest_present: "Discovery manifest should be present",
  mcp_handshake: "Server must complete the MCP handshake",
  tools_list: "Server must respond to tools/list",
  tool_schemas: "Tool input schemas must be well-formed",
  tool_descriptions: "Every tool should have a description",
  security_lint: "Tool descriptions must not contain injection patterns or leaked secrets",
  auth_open: "High-capability tools should not be reachable without authentication",
  transport_tls: "Remote servers should be served over HTTPS, not plaintext HTTP",
  "probe.crash": "Server must not crash or drop the connection on adversarial input",
  "probe.command-exec": "Server must not be exploitable for command execution",
  "probe.path-traversal": "Server must not be exploitable for path traversal",
  "probe.ssrf": "Server must not be exploitable for SSRF to internal/metadata endpoints",
  "probe.leak": "Server must not leak secret-shaped strings in tool output",
  "probe.weak-validation": "Server should reject input that violates its declared schema",
  "probe.slow": "Server should respond within a reasonable time (DoS surface)",
  "probe.output-schema": "Structured output must conform to the tool's declared outputSchema",
};

const levelForCheck: Record<Severity, SarifLevel | null> = {
  fail: "error",
  warn: "warning",
  info: "note",
  pass: null, // findings only — passing checks aren't reported
};

function levelForVuln(v: Vuln): SarifLevel {
  switch (v) {
    case "crash":
    case "command-exec":
    case "path-traversal":
    case "ssrf":
    case "leak":
      return "error";
    case "output-schema":
    case "weak-validation":
      return "warning";
    case "slow":
      return "note";
  }
}

/** Build a SARIF 2.1.0 document (as a JSON string) from doctor/probe evidence. */
export function sarifReport(input: SarifInput): string {
  const results: SarifResult[] = [];
  const ruleIds = new Set<string>();

  const artifactUri = `mcp-server:${encodeURIComponent(input.target)}`;
  const location = (tool?: string) => ({
    physicalLocation: { artifactLocation: { uri: artifactUri } },
    ...(tool ? { logicalLocations: [{ name: tool, kind: "function" as const }] } : {}),
  });

  for (const c of input.doctor?.checks ?? []) {
    const level = levelForCheck[c.severity];
    if (!level) continue;
    ruleIds.add(c.id);
    results.push({
      ruleId: c.id,
      level,
      message: { text: c.detail || c.title },
      locations: [location()],
      partialFingerprints: { mcpcert: fp(input.target, c.id, c.detail) },
    });
  }

  for (const f of input.probe?.findings ?? []) {
    const ruleId = `probe.${f.vuln}`;
    ruleIds.add(ruleId);
    results.push({
      ruleId,
      level: levelForVuln(f.vuln),
      message: { text: `${f.tool} [${f.category}]: ${f.detail}` },
      locations: [location(f.tool)],
      partialFingerprints: { mcpcert: fp(input.target, ruleId, `${f.tool}:${f.detail}`) },
    });
  }

  const rules = [...ruleIds].sort().map((id) => ({
    id,
    name: id,
    shortDescription: { text: RULE_TEXT[id] ?? id },
    helpUri: HOMEPAGE,
  }));

  const sarif = {
    $schema: "https://json.schemastore.org/sarif-2.1.0.json",
    version: "2.1.0",
    runs: [
      {
        tool: {
          driver: {
            name: "mcpcert",
            version: input.toolVersion,
            informationUri: HOMEPAGE,
            rules,
          },
        },
        results,
      },
    ],
  };

  return `${JSON.stringify(sarif, null, 2)}\n`;
}

function fp(target: string, ruleId: string, detail: string): string {
  let h = 0;
  for (const ch of `${target}|${ruleId}|${detail}`) h = (Math.imul(31, h) + ch.charCodeAt(0)) | 0;
  return (h >>> 0).toString(16).padStart(8, "0");
}
