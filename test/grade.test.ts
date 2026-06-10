import { describe, expect, it } from "vitest";
import { grade } from "../src/grade";
import type { Tool } from "../src/lint";
import type { ProbeFinding, ProbeReport } from "../src/probe";
import type { CheckResult, DoctorResult } from "../src/types";

const pass = (id: string): CheckResult => ({ id, title: id, severity: "pass", detail: "ok", points: 1, maxPoints: 1 });
const fail = (id: string, detail = ""): CheckResult => ({ id, title: id, severity: "fail", detail, points: 0, maxPoints: 1 });
const CLEAN = ["mcp_handshake", "tools_list", "tool_schemas", "tool_descriptions", "security_lint"].map(pass);

function doctor(checks: CheckResult[], tools: Tool[] = [{ name: "get_thing", description: "gets a thing", inputSchema: { type: "object" } }]): DoctorResult {
  return { target: "demo", startedAt: "t", checks, score: 0, maxScore: 0, tools };
}
function probe(findings: ProbeFinding[], probesRun = 10): ProbeReport {
  return { target: "demo", toolsProbed: 1, toolsSkipped: 0, probesRun, findings };
}
const byDim = (g: ReturnType<typeof grade>) => Object.fromEntries(g.dimensions.map((d) => [d.dimension, d]));

describe("grade", () => {
  it("scores a clean server 100/A and marks robustness+exploitation not assessed without a probe", () => {
    const g = grade({ doctor: doctor(CLEAN) });
    expect(g.score).toBe(100);
    expect(g.grade).toBe("A");
    expect(g.certified).toBe(true);
    expect(g.assessed.probe).toBe(false);
    expect(byDim(g).robustness.assessed).toBe(false);
    expect(byDim(g).exploitation.assessed).toBe(false);
    expect(byDim(g).conformance.assessed).toBe(true);
  });

  it("caps an unreachable server and leaves the tool dimensions unassessed", () => {
    const g = grade({ doctor: doctor([fail("mcp_handshake", "connect failed")], []) });
    expect(g.score).toBeLessThanOrEqual(25);
    expect(g.grade).toBe("F");
    expect(g.certified).toBe(false);
    // the dimension itself records the raw deduction; only the overall is capped
    expect(byDim(g).conformance.score).toBe(40);
    expect(byDim(g).injection.assessed).toBe(false);
  });

  it("treats a confirmed exploit as catastrophic — caps at 15, F, not certified", () => {
    const tools: Tool[] = [{ name: "run_command", description: "run a shell command", inputSchema: { type: "object" } }];
    const g = grade({ doctor: doctor(CLEAN, tools), probe: probe([{ tool: "run_command", category: "command-injection", vuln: "command-exec", detail: "id output (confirmed)" }]) });
    expect(g.score).toBeLessThanOrEqual(15);
    expect(g.grade).toBe("F");
    expect(g.certified).toBe(false);
    expect(g.caps.some((c) => c.reason.includes("command-exec"))).toBe(true);
    expect(g.assessed.probe).toBe(true);
  });

  it("amplifies a flaw by blast radius — weak validation hurts more on a destructive tool", () => {
    const onDelete = grade({
      doctor: doctor(CLEAN, [{ name: "delete_file", description: "delete a file", inputSchema: { type: "object" } }]),
      probe: probe([{ tool: "delete_file", category: "oversized", vuln: "weak-validation", detail: "accepted a 100k string" }]),
    });
    const onWeather = grade({
      doctor: doctor(CLEAN, [{ name: "get_weather", description: "returns the weather", inputSchema: { type: "object" } }]),
      probe: probe([{ tool: "get_weather", category: "oversized", vuln: "weak-validation", detail: "accepted a 100k string" }]),
    });
    expect(byDim(onDelete).robustness.deductions[0].points).toBe(36); // 18 medium × 2.0 blast radius
    expect(byDim(onWeather).robustness.deductions[0].points).toBe(18); // 18 medium × 1.0
    expect(onDelete.score).toBeLessThan(onWeather.score);
  });

  it("rewards a server that survives the probe — robustness + exploitation = 100", () => {
    const g = grade({ doctor: doctor(CLEAN), probe: probe([]) });
    expect(byDim(g).robustness.assessed).toBe(true);
    expect(byDim(g).robustness.score).toBe(100);
    expect(byDim(g).exploitation.score).toBe(100);
    expect(g.score).toBe(100);
    expect(g.certified).toBe(true);
  });

  it("renormalises the assessed dimension weights to sum ~1", () => {
    const passive = grade({ doctor: doctor(CLEAN) });
    const active = grade({ doctor: doctor(CLEAN), probe: probe([]) });
    for (const g of [passive, active]) {
      const sum = g.dimensions.reduce((s, d) => s + d.weight, 0);
      expect(sum).toBeGreaterThan(0.98);
      expect(sum).toBeLessThanOrEqual(1.0001);
    }
    // unassessed dims carry zero weight
    expect(byDim(passive).robustness.weight).toBe(0);
  });

  it("refuses to certify when a single dimension fails badly, even if the average clears 80", () => {
    // many medium weak-validations sink robustness to 0 while the average stays >= 80
    const findings: ProbeFinding[] = Array.from({ length: 8 }, (_, i) => ({ tool: "t", category: "oversized", vuln: "weak-validation", detail: `bad input ${i}` }));
    const g = grade({ doctor: doctor(CLEAN), probe: probe(findings) });
    expect(byDim(g).robustness.score).toBe(0);
    expect(g.score).toBeGreaterThanOrEqual(80); // average still clears the threshold
    expect(g.certified).toBe(false); // ...but a failed dimension blocks the badge
  });

  it("assesses the transport dimension only for http targets", () => {
    const stdio = grade({ doctor: doctor(CLEAN) }); // target "demo" -> stdio
    expect(byDim(stdio).transport.assessed).toBe(false);

    const checks: CheckResult[] = [
      ...CLEAN,
      { id: "transport_tls", title: "tls", severity: "warn", detail: "plaintext to remote host", points: 0, maxPoints: 3 },
      { id: "auth_open", title: "auth", severity: "warn", detail: "risky tools, no credentials", points: 0, maxPoints: 4 },
    ];
    const http = grade({
      doctor: { target: "http://api.example.com/mcp", startedAt: "t", checks, score: 0, maxScore: 0, tools: [{ name: "run_command", description: "shell" }] },
    });
    expect(byDim(http).transport.assessed).toBe(true);
    expect(byDim(http).transport.score).toBe(64); // 100 - 18 - 18 (two medium findings)
  });

  it("a secret leaked at runtime caps confidentiality-driven grade and decertifies", () => {
    const g = grade({ doctor: doctor(CLEAN), probe: probe([{ tool: "get_thing", category: "valid", vuln: "leak", detail: "output leaked an OpenAI-style API key" }]) });
    expect(g.score).toBeLessThanOrEqual(40);
    expect(g.certified).toBe(false);
    expect(g.caps.some((c) => c.ceiling === 40)).toBe(true);
  });
});
