import { describe, expect, it } from "vitest";
import type { Tool } from "../src/lint";
import { certificationMarkdown } from "../src/markdown";
import type { CertResult } from "../src/score";
import type { RiskFinding } from "../src/security";
import type { DoctorResult } from "../src/types";

const result: DoctorResult = {
  target: "demo",
  startedAt: "2026-01-01T00:00:00Z",
  checks: [{ id: "x", title: "Handshake", severity: "pass", detail: "ok", points: 6, maxPoints: 6 }],
  score: 6,
  maxScore: 6,
};
const cert: CertResult = { target: "demo", score: 100, grade: "A", certified: true, failed: 0 };
const tools: Tool[] = [{ name: "get_weather", description: "Returns weather.", inputSchema: { type: "object" } }];
const risks: RiskFinding[] = [{ tool: "run_command", risk: "shell-exec", reason: "can execute shell commands" }];

describe("certificationMarkdown", () => {
  it("renders the key sections", () => {
    const md = certificationMarkdown({ target: "demo", result, cert, tools, risks });
    expect(md).toContain("# MCP Cert Report");
    expect(md).toContain("100/100 (A)");
    expect(md).toContain("✅ Certified");
    expect(md).toContain("## Checks");
    expect(md).toContain("## Tools (1)");
    expect(md).toContain("get_weather");
    expect(md).toContain("## Capability risk");
    expect(md).toContain("shell-exec");
    expect(md).toContain("img.shields.io/badge/");
  });

  it("notes when there is no elevated risk", () => {
    const md = certificationMarkdown({ target: "demo", result, cert, tools, risks: [] });
    expect(md).toContain("No elevated-capability tools detected.");
  });
});
