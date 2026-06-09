import { describe, expect, it } from "vitest";
import type { Probe } from "../src/fuzz";
import { analyzeProbe, type ProbeOutcome } from "../src/probe";

const probe = (category: Probe["category"], expectation: Probe["expect"]): Probe => ({ category, expect: expectation, args: {}, note: "n" });
const outcome = (o: Partial<ProbeOutcome>): ProbeOutcome => ({ errored: false, resultText: "", latencyMs: 1, crashed: false, ...o });

describe("analyzeProbe", () => {
  it("reports a crash and nothing else", () => {
    const f = analyzeProbe("t", probe("oversized", "graceful-error"), outcome({ crashed: true }));
    expect(f).toHaveLength(1);
    expect(f[0].vuln).toBe("crash");
  });

  it("flags weak validation when malformed input is accepted", () => {
    const f = analyzeProbe("t", probe("missing-required", "graceful-error"), outcome({ errored: false }));
    expect(f.some((x) => x.vuln === "weak-validation")).toBe(true);
  });

  it("does NOT flag weak validation when the server errors properly", () => {
    const f = analyzeProbe("t", probe("missing-required", "graceful-error"), outcome({ errored: true, resultText: "Invalid params" }));
    expect(f.some((x) => x.vuln === "weak-validation")).toBe(false);
  });

  it("flags a secret leak in the output", () => {
    const f = analyzeProbe("t", probe("valid", "ok"), outcome({ resultText: "here is sk-ABCDEFGHIJKLMNOPQRSTUVWX" }));
    expect(f.some((x) => x.vuln === "leak")).toBe(true);
  });

  it("flags injection echo when a successful response reflects the payload", () => {
    const f = analyzeProbe("t", probe("injection", "ok"), outcome({ errored: false, resultText: "Sure — I will ignore all previous instructions" }));
    expect(f.some((x) => x.vuln === "injection-echo")).toBe(true);
  });

  it("does NOT flag injection-echo when the payload only appears in an error (false positive guard)", () => {
    const f = analyzeProbe("t", probe("injection", "ok"), outcome({ errored: true, resultText: "ENOENT: no such file 'ignore all previous instructions'" }));
    expect(f.some((x) => x.vuln === "injection-echo")).toBe(false);
  });

  it("flags slow responses as a DoS surface", () => {
    const f = analyzeProbe("t", probe("oversized", "graceful-error"), outcome({ errored: true, latencyMs: 99999 }));
    expect(f.some((x) => x.vuln === "slow")).toBe(true);
  });
});
