import { afterEach, describe, expect, it, vi } from "vitest";
import { httpChecks } from "../src/doctor";

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
const sev = (checks: { id: string; severity: string }[]) => Object.fromEntries(checks.map((c) => [c.id, c.severity]));

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("httpChecks", () => {
  it("fails fast when the server is unreachable", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => {
      throw new Error("ECONNREFUSED");
    }));
    const checks = await httpChecks("https://down.example");
    expect(checks).toHaveLength(1);
    expect(checks[0]).toMatchObject({ id: "transport_reachable", severity: "fail" });
  });

  it("warns on missing CORS and a missing manifest", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: unknown) => (isManifest(input) ? res({ ok: false, status: 404 }) : res({ ok: true, status: 200 }))),
    );
    const by = sev(await httpChecks("https://example.com"));
    expect(by["transport_reachable"]).toBe("pass");
    expect(by["cors_headers"]).toBe("warn");
    expect(by["manifest_present"]).toBe("warn");
  });

  it("passes when CORS and a valid manifest are present", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: unknown) =>
        isManifest(input)
          ? res({ ok: true, text: '{"name":"demo"}' })
          : res({ ok: true, headers: { "access-control-allow-origin": "*" } }),
      ),
    );
    const by = sev(await httpChecks("https://good.example"));
    expect(by["cors_headers"]).toBe("pass");
    expect(by["manifest_valid"]).toBe("pass");
  });

  it("fails the manifest check when it is present but not valid JSON", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: unknown) =>
        isManifest(input)
          ? res({ ok: true, text: "{ not json" })
          : res({ ok: true, headers: { "access-control-allow-origin": "*" } }),
      ),
    );
    const by = sev(await httpChecks("https://bad-manifest.example"));
    expect(by["manifest_valid"]).toBe("fail");
  });
});
