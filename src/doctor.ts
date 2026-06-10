import { fail, finalize, pass, warn } from "./check.js";
import type { Tool } from "./lint.js";
import { classifyTarget, runProtocolChecks } from "./protocol.js";
import { assessRisks } from "./security.js";
import type { CheckResult, DoctorResult } from "./types.js";

/**
 * `mcpcert doctor` — zero-config, deterministic conformance + health scan.
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
  const proto = await runProtocolChecks(target);
  checks.push(...proto.checks);
  if (classifyTarget(target) === "http") {
    checks.push(...authTransportChecks(target, proto.tools));
  }

  return finalize(target, startedAt, checks, proto.tools);
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

/**
 * Auth + transport posture for HTTP targets. Deterministic and conservative —
 * it only flags what it can actually observe (plaintext to a remote host; that we
 * reached the server with no credentials at all). Loopback is exempt: local dev
 * servers over plain http with no auth are normal, not a finding.
 */
export function authTransportChecks(target: string, tools: Tool[]): CheckResult[] {
  const checks: CheckResult[] = [];
  let url: URL;
  try {
    url = new URL(target);
  } catch {
    return checks;
  }
  const loopback = isLoopback(url.hostname);

  if (url.protocol === "https:") {
    checks.push(pass("transport_tls", "Encrypted transport (HTTPS)", "served over TLS", 3));
  } else if (loopback) {
    checks.push(pass("transport_tls", "Encrypted transport (HTTPS)", "plaintext is fine for a loopback address", 3));
  } else {
    checks.push(
      warn("transport_tls", "Encrypted transport (HTTPS)", `served over plaintext http:// to remote host ${url.hostname} — requests and any tokens travel in the clear`, 0, 3),
    );
  }

  // We connected with no credentials; if that succeeded and high-capability tools
  // are advertised to a non-loopback host, that's real exposure.
  const riskyTools = [...new Set(assessRisks(tools).map((r) => r.tool))];
  if (loopback) {
    checks.push(pass("auth_open", "High-capability tools require authentication", "loopback address — local access only", 4));
  } else if (riskyTools.length > 0) {
    checks.push(
      warn("auth_open", "High-capability tools require authentication", `reached with no credentials; ${riskyTools.length} high-capability tool(s) exposed to the network: ${riskyTools.slice(0, 5).join(", ")}`, 0, 4),
    );
  } else {
    checks.push(pass("auth_open", "High-capability tools require authentication", "no elevated-capability tools advertised", 4));
  }

  return checks;
}

function isLoopback(hostname: string): boolean {
  return (
    hostname === "localhost" ||
    hostname === "::1" ||
    hostname === "[::1]" ||
    hostname === "0.0.0.0" ||
    /^127\./.test(hostname) ||
    hostname.endsWith(".local")
  );
}

async function timed<T>(fn: () => Promise<T>): Promise<{ value?: T; error?: string; ms: number }> {
  const t0 = Date.now();
  try {
    return { value: await fn(), ms: Date.now() - t0 };
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e), ms: Date.now() - t0 };
  }
}
