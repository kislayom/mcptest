/**
 * Deterministic, pattern-based lint over a server's advertised tools, plus a
 * recursive well-formedness check on each tool's JSON-Schema. No LLM here —
 * pure functions over the tool list, trivially testable, never flaky in CI.
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

const VALID_TYPES = new Set(["object", "array", "string", "number", "integer", "boolean", "null"]);

/**
 * Returns the first well-formedness problem with a JSON-Schema, or null.
 * Recurses through `properties` and `items`. The top-level inputSchema must be
 * an object schema (MCP tools take an object of arguments).
 */
export function schemaIssue(schema: unknown, path = "inputSchema"): string | null {
  if (schema == null) return `${path} is missing`;
  if (typeof schema !== "object" || Array.isArray(schema)) return `${path} must be an object schema`;

  const s = schema as Record<string, unknown>;

  if (path === "inputSchema" && s.type !== "object") {
    return `inputSchema.type should be "object" (got ${JSON.stringify(s.type)})`;
  }

  if (s.type !== undefined) {
    const types = Array.isArray(s.type) ? s.type : [s.type];
    for (const t of types) {
      if (typeof t !== "string" || !VALID_TYPES.has(t)) return `${path}.type has an invalid value ${JSON.stringify(t)}`;
    }
  }

  if (s.required !== undefined && !(Array.isArray(s.required) && s.required.every((x) => typeof x === "string"))) {
    return `${path}.required must be an array of strings`;
  }

  if (s.enum !== undefined && !Array.isArray(s.enum)) {
    return `${path}.enum must be an array`;
  }

  if (s.properties !== undefined) {
    if (typeof s.properties !== "object" || s.properties === null || Array.isArray(s.properties)) {
      return `${path}.properties must be an object`;
    }
    for (const [key, value] of Object.entries(s.properties as Record<string, unknown>)) {
      const issue = schemaIssue(value, `${path}.properties.${key}`);
      if (issue) return issue;
    }
  }

  if (s.items !== undefined) {
    const issue = schemaIssue(s.items, `${path}.items`);
    if (issue) return issue;
  }

  return null;
}

/** Returns the kind of secret-shaped string found in `text`, or null. */
export function secretIn(text: string): string | null {
  for (const p of SECRET_PATTERNS) {
    if (p.re.test(text)) return p.what;
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
