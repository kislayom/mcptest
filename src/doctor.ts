import { fail, finalize, pass, warn } from "./check.js";
import { classifyTarget, runProtocolChecks } from "./protocol.js";
import type { CheckResult, DoctorResult } from "./types.js";

/**
 * `mcptest doctor` — zero-config, deterministic conformance + health scan.
 *
 * URL targets get the HTTP-surface checks (reachability, discovery manifest,
 * CORS) plus the MCP protocol checks. stdio command targets get the protocol
 * checks only. Hard rule everywhere in this path: DETERMINISTIC, no LLM.
 */
export async function runDoctor(target: string): Promise<DoctorResult> {
  const startedAt = new Date().toISOString();
  const checks: CheckResult[] = [];

  if (classifyTarget(target) === "http") {
    checks.push(...(await httpChecks(target)));
  }
  checks.push(...(await runProtocolChecks(target)));

  return finalize(target, startedAt, checks);
}

/** Deterministic HTTP-surface checks for URL targets (reachability, CORS, discovery manifest). */
export async function httpChecks(target: string): Promise<CheckResult[]> {
  const checks: CheckResult[] = [];
  const url = new URL(target);

  // Reachability — any HTTP response counts (an MCP endpoint may answer GET
  // with 4xx); only a network-level error is a failure.
  const reach = await timed(() => fetch(url, { method: "GET" }));
  if (!reach.value) {
    checks.push(fail("transport_reachable", "Server responds over HTTP", `Request failed: ${reach.error ?? "no response"}`, 5));
    return checks;
  }
  const res = reach.value;
  checks.push(pass("transport_reachable", "Server responds over HTTP", `HTTP ${res.status} in ${reach.ms}ms`, 5));

  // CORS — matters for browser-based MCP clients.
  const aco = res.headers.get("access-control-allow-origin");
  checks.push(
    aco
      ? pass("cors_headers", "CORS headers present", `access-control-allow-origin: ${aco}`, 3)
      : warn("cors_headers", "CORS headers present", "No access-control-allow-origin header; browser-based MCP clients may be blocked.", 0, 3),
  );

  // Discovery manifest at the well-known path (tracks the evolving MCP discovery spec).
  const manifestUrl = new URL("/.well-known/mcp.json", url.origin);
  const man = await timed(() => fetch(manifestUrl, { method: "GET" }));
  if (man.value && man.value.ok) {
    const text = await man.value.text();
    try {
      JSON.parse(text);
      checks.push(pass("manifest_valid", "Discovery manifest is valid JSON", `${manifestUrl.pathname} parsed OK`, 4));
    } catch {
      checks.push(fail("manifest_valid", "Discovery manifest is valid JSON", `${manifestUrl.pathname} exists but is not valid JSON.`, 4));
    }
  } else {
    checks.push(warn("manifest_present", "Discovery manifest present", `No manifest at ${manifestUrl.pathname}; clients may not auto-discover this server.`, 0, 4));
  }

  return checks;
}

async function timed<T>(fn: () => Promise<T>): Promise<{ value?: T; error?: string; ms: number }> {
  const t0 = Date.now();
  try {
    return { value: await fn(), ms: Date.now() - t0 };
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e), ms: Date.now() - t0 };
  }
}
