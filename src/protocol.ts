import { fail, pass, warn } from "./check.js";
import { lintTools, type Tool } from "./lint.js";
import { openClient } from "./transport.js";
import type { CheckResult } from "./types.js";

export { classifyTarget } from "./transport.js";

/**
 * Connect to the MCP server, run the deterministic protocol-level checks
 * (handshake, tools/list, per-tool schema + description + security lint),
 * and always tear the client down afterwards.
 */
export async function runProtocolChecks(target: string): Promise<CheckResult[]> {
  const checks: CheckResult[] = [];

  let opened: Awaited<ReturnType<typeof openClient>>;
  try {
    opened = await openClient(target);
    checks.push(pass("mcp_handshake", "Completes the MCP handshake", `connected over ${opened.transport}`, 6));
  } catch (e) {
    checks.push(fail("mcp_handshake", "Completes the MCP handshake", `connect failed: ${msg(e)}`, 6));
    return checks;
  }

  try {
    const res = await opened.client.listTools();
    const tools: Tool[] = res.tools.map((t) => ({ name: t.name, description: t.description, inputSchema: t.inputSchema }));
    checks.push(pass("tools_list", "Responds to tools/list", `${tools.length} tool(s) advertised`, 4));
    checks.push(...toolChecks(tools));
  } catch (e) {
    checks.push(fail("tools_list", "Responds to tools/list", `tools/list failed: ${msg(e)}`, 4));
  } finally {
    await opened.close();
  }

  return checks;
}

function toolChecks(tools: Tool[]): CheckResult[] {
  const findings = lintTools(tools);
  const of = (k: string) => findings.filter((f) => f.kind === k);
  const checks: CheckResult[] = [];

  const badSchema = of("bad-schema");
  checks.push(
    badSchema.length === 0
      ? pass("tool_schemas", "All tool input schemas are well-formed", `${tools.length} schema(s) OK`, 5)
      : fail("tool_schemas", "All tool input schemas are well-formed", `${badSchema.length} issue(s): ${preview(badSchema.map((f) => `${f.tool} — ${f.detail}`))}`, 5),
  );

  const noDesc = of("no-description");
  checks.push(
    noDesc.length === 0
      ? pass("tool_descriptions", "Every tool has a description", `${tools.length} described`, 2)
      : warn("tool_descriptions", "Every tool has a description", `${noDesc.length} without a description: ${preview(noDesc.map((f) => f.tool))}`, 0, 2),
  );

  const sec = [...of("injection"), ...of("secret")];
  checks.push(
    sec.length === 0
      ? pass("security_lint", "No injection-shaped descriptions or leaked secrets", "clean", 5)
      : fail("security_lint", "No injection-shaped descriptions or leaked secrets", `${sec.length} finding(s): ${preview(sec.map((f) => `${f.tool} [${f.kind}] ${f.detail}`))}`, 5),
  );

  return checks;
}

function preview(items: string[], n = 5): string {
  return items.slice(0, n).join("; ") + (items.length > n ? ` … (+${items.length - n} more)` : "");
}

function msg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
