/**
 * Deterministic, pattern-based lint over a server's advertised tools.
 * No LLM here — pure functions over the tool list, so it's trivially testable
 * and never flakes in CI.
 */

export interface Tool {
  name: string;
  description?: string;
  inputSchema?: unknown;
}

export type FindingKind = "injection" | "secret" | "no-description" | "bad-schema";

export interface LintFinding {
  tool: string;
  kind: FindingKind;
  detail: string;
}

const INJECTION_PATTERNS: { re: RegExp; note: string }[] = [
  {
    re: /\b(ignore|disregard|forget)\b[\s\S]{0,40}\b(previous|prior|above|earlier|all)\b[\s\S]{0,24}\b(instruction|prompt|rule|context|message)/i,
    note: "tells the agent to ignore prior instructions",
  },
  { re: /\b(system|developer)\s+(prompt|message|instructions?)\b/i, note: "references the system/developer prompt" },
  {
    re: /\b(send|exfiltrate|leak|e-?mail|upload|post|forward)\b[\s\S]{0,32}\b(api[\s_-]?key|secret|token|password|credential|env(ironment)?\s*var)/i,
    note: "instructs sending secrets or credentials",
  },
];

const SECRET_PATTERNS: { re: RegExp; what: string }[] = [
  { re: /sk-[A-Za-z0-9]{20,}/, what: "OpenAI-style API key" },
  { re: /AKIA[0-9A-Z]{16}/, what: "AWS access key id" },
  { re: /gh[pousr]_[A-Za-z0-9]{20,}/, what: "GitHub token" },
  { re: /\b(api[\s_-]?key|secret|token|password)\b\s*[:=]\s*["']?[A-Za-z0-9_-]{12,}/i, what: "inline credential" },
];

/** Returns a human-readable problem with a tool's inputSchema, or null if it looks well-formed. */
export function schemaIssue(schema: unknown): string | null {
  if (schema == null || typeof schema !== "object") return "missing or non-object inputSchema";
  const s = schema as Record<string, unknown>;
  if (s.type !== "object") return `inputSchema.type should be "object" (got ${JSON.stringify(s.type)})`;
  if (s.properties != null && (typeof s.properties !== "object" || Array.isArray(s.properties))) {
    return "inputSchema.properties must be an object";
  }
  if (s.required != null && !(Array.isArray(s.required) && s.required.every((x) => typeof x === "string"))) {
    return "inputSchema.required must be an array of strings";
  }
  return null;
}

export function lintTools(tools: Tool[]): LintFinding[] {
  const findings: LintFinding[] = [];

  for (const t of tools) {
    const desc = t.description ?? "";

    if (desc.trim() === "") {
      findings.push({ tool: t.name, kind: "no-description", detail: "no description" });
    }

    for (const p of INJECTION_PATTERNS) {
      if (p.re.test(desc)) {
        findings.push({ tool: t.name, kind: "injection", detail: p.note });
        break;
      }
    }

    for (const p of SECRET_PATTERNS) {
      if (p.re.test(desc)) {
        findings.push({ tool: t.name, kind: "secret", detail: p.what });
        break;
      }
    }

    const si = schemaIssue(t.inputSchema);
    if (si) findings.push({ tool: t.name, kind: "bad-schema", detail: si });
  }

  return findings;
}
