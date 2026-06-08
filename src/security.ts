import type { Tool } from "./lint.js";

export type RiskKind = "shell-exec" | "destructive" | "filesystem-write" | "network" | "credentials";

export interface RiskFinding {
  tool: string;
  risk: RiskKind;
  reason: string;
}

const RISKS: { kind: RiskKind; re: RegExp; reason: string }[] = [
  { kind: "shell-exec", re: /\b(exec|shell|spawn|subprocess|bash|eval|terminal)\b|run_command|execute_command/i, reason: "can execute shell commands" },
  { kind: "destructive", re: /\b(delete|remove|destroy|wipe|truncate|drop|unlink)\b|delete_file|remove_/i, reason: "can destroy data" },
  { kind: "filesystem-write", re: /\b(write|overwrite|rename|mkdir|chmod)\b|write_file|edit_file|create_directory/i, reason: "can write to the filesystem" },
  { kind: "network", re: /\b(http|https|fetch|download|upload|outbound|webhook)\b|api[_-]?call|send_request/i, reason: "can make network requests" },
  { kind: "credentials", re: /\b(password|secret|token|credential|api[_-]?key|private key)\b/i, reason: "handles credentials" },
];

/** Static, deterministic capability-risk classification from tool name + description. */
export function assessRisks(tools: Tool[]): RiskFinding[] {
  const findings: RiskFinding[] = [];
  for (const t of tools) {
    const hay = `${t.name} ${t.description ?? ""}`;
    for (const r of RISKS) {
      if (r.re.test(hay)) findings.push({ tool: t.name, risk: r.kind, reason: r.reason });
    }
  }
  return findings;
}
