import type { CheckResult, DoctorResult } from "./types.js";

/**
 * `mcptest doctor` — zero-config, deterministic conformance + health scan.
 *
 * v0 scope: HTTP(S) MCP servers. We check reachability, the discovery
 * manifest, and CORS. The MCP protocol-level checks (handshake, `tools/list`,
 * per-tool JSON-Schema validation, security lint) land next on top of the
 * official `@modelcontextprotocol/sdk` client — see ROADMAP in the README.
 *
 * Hard rule for everything in this path: it is DETERMINISTIC. No LLM, ever.
 * That is what lets `doctor` run in CI without flaking.
 */
export async function runDoctor(target: string): Promise<DoctorResult> {
  const startedAt = new Date().toISOString();
  const checks: CheckResult[] = [];

  let url: URL;
  try {
    url = new URL(target);
  } catch {
    checks.push(fail("target_url", "Target is a valid URL", `Could not parse "${target}" as a URL. (stdio targets are coming next.)`, 5));
    return finalize(target, startedAt, checks);
  }

  // 1. Reachability — any HTTP response counts (an MCP endpoint may answer GET
  //    with 4xx); only a network-level error is a failure.
  const reach = await timed(() => fetch(url, { method: "GET" }));
  if (!reach.value) {
    checks.push(fail("transport_reachable", "Server responds over HTTP", `Request failed: ${reach.error ?? "no response"}`, 5));
    return finalize(target, startedAt, checks);
  }
  const res = reach.value;
  checks.push(pass("transport_reachable", "Server responds over HTTP", `HTTP ${res.status} in ${reach.ms}ms`, 5));

  // 2. CORS — matters for browser-based MCP clients.
  const aco = res.headers.get("access-control-allow-origin");
  checks.push(
    aco
      ? pass("cors_headers", "CORS headers present", `access-control-allow-origin: ${aco}`, 3)
      : warn("cors_headers", "CORS headers present", "No access-control-allow-origin header; browser-based MCP clients may be blocked.", 0, 3),
  );

  // 3. Discovery manifest at the well-known path (tracks the evolving MCP discovery spec).
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

  return finalize(target, startedAt, checks);
}

function finalize(target: string, startedAt: string, checks: CheckResult[]): DoctorResult {
  const score = checks.reduce((s, c) => s + c.points, 0);
  const maxScore = checks.reduce((s, c) => s + c.maxPoints, 0);
  return { target, startedAt, checks, score, maxScore };
}

function pass(id: string, title: string, detail: string, pts: number): CheckResult {
  return { id, title, severity: "pass", detail, points: pts, maxPoints: pts };
}

function warn(id: string, title: string, detail: string, pts: number, max: number): CheckResult {
  return { id, title, severity: "warn", detail, points: pts, maxPoints: max };
}

function fail(id: string, title: string, detail: string, max: number): CheckResult {
  return { id, title, severity: "fail", detail, points: 0, maxPoints: max };
}

async function timed<T>(fn: () => Promise<T>): Promise<{ value?: T; error?: string; ms: number }> {
  const t0 = Date.now();
  try {
    return { value: await fn(), ms: Date.now() - t0 };
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e), ms: Date.now() - t0 };
  }
}
