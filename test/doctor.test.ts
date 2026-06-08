import { afterEach, describe, expect, it, vi } from "vitest";
import { runDoctor } from "../src/doctor";

/** Build a minimal fetch Response stand-in. */
function res(opts: { ok?: boolean; status?: number; headers?: Record<string, string>; text?: string }): Response {
  return {
    ok: opts.ok ?? true,
    status: opts.status ?? 200,
    headers: new Headers(opts.headers ?? {}),
    text: async () => opts.text ?? "",
  } as unknown as Response;
}

const isManifest = (input: unknown) => String(input).endsWith("/.well-known/mcp.json");

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("runDoctor", () => {
  it("fails fast on an invalid URL", async () => {
    const r = await runDoctor("not a url");
    expect(r.checks).toHaveLength(1);
    expect(r.checks[0]).toMatchObject({ id: "target_url", severity: "fail" });
    expect(r.score).toBe(0);
    expect(r.maxScore).toBe(5);
  });

  it("fails fast when the server is unreachable", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => {
      throw new Error("ECONNREFUSED");
    }));
    const r = await runDoctor("https://down.example");
    expect(r.checks).toHaveLength(1);
    expect(r.checks[0]).toMatchObject({ id: "transport_reachable", severity: "fail" });
    expect(r.score).toBe(0);
  });

  it("warns on missing CORS and a missing manifest", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: unknown) =>
        isManifest(input) ? res({ ok: false, status: 404 }) : res({ ok: true, status: 200 }),
      ),
    );
    const r = await runDoctor("https://example.com");
    const by = Object.fromEntries(r.checks.map((c) => [c.id, c.severity]));
    expect(by["transport_reachable"]).toBe("pass");
    expect(by["cors_headers"]).toBe("warn");
    expect(by["manifest_present"]).toBe("warn");
    expect(r.score).toBe(5);
    expect(r.maxScore).toBe(12);
  });

  it("passes when CORS and a valid manifest are present", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: unknown) =>
        isManifest(input)
          ? res({ ok: true, status: 200, text: '{"name":"demo"}' })
          : res({ ok: true, status: 200, headers: { "access-control-allow-origin": "*" } }),
      ),
    );
    const r = await runDoctor("https://good.example");
    const by = Object.fromEntries(r.checks.map((c) => [c.id, c.severity]));
    expect(by["cors_headers"]).toBe("pass");
    expect(by["manifest_valid"]).toBe("pass");
    expect(r.score).toBe(12);
    expect(r.maxScore).toBe(12);
  });

  it("fails the manifest check when it is present but not valid JSON", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: unknown) =>
        isManifest(input)
          ? res({ ok: true, status: 200, text: "{ not json" })
          : res({ ok: true, status: 200, headers: { "access-control-allow-origin": "*" } }),
      ),
    );
    const r = await runDoctor("https://bad-manifest.example");
    const by = Object.fromEntries(r.checks.map((c) => [c.id, c.severity]));
    expect(by["manifest_valid"]).toBe("fail");
  });
});
