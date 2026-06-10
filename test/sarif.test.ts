import { describe, expect, it } from "vitest";
import type { ProbeReport } from "../src/probe";
import { sarifReport } from "../src/sarif";
import type { DoctorResult } from "../src/types";

const doctor: DoctorResult = {
  target: "demo",
  startedAt: "t",
  checks: [
    { id: "mcp_handshake", title: "Handshake", severity: "pass", detail: "ok", points: 6, maxPoints: 6 },
    { id: "security_lint", title: "Lint", severity: "fail", detail: "t [injection] bad", points: 0, maxPoints: 5 },
    { id: "tool_descriptions", title: "Desc", severity: "warn", detail: "1 missing", points: 0, maxPoints: 2 },
  ],
  score: 6,
  maxScore: 13,
};
const probe: ProbeReport = {
  target: "demo",
  toolsProbed: 1,
  toolsSkipped: 0,
  probesRun: 3,
  findings: [
    { tool: "run_cmd", category: "command-injection", vuln: "command-exec", detail: "id output (confirmed)" },
    { tool: "slow_tool", category: "oversized", vuln: "slow", detail: "took 12000ms" },
  ],
};

describe("sarifReport", () => {
  const sarif = JSON.parse(sarifReport({ target: "node server.js", toolVersion: "9.9.9", doctor, probe }));

  it("is well-formed SARIF 2.1.0 with the mcpcert driver", () => {
    expect(sarif.version).toBe("2.1.0");
    expect(sarif.$schema).toContain("sarif-2.1.0");
    expect(sarif.runs[0].tool.driver.name).toBe("mcpcert");
    expect(sarif.runs[0].tool.driver.version).toBe("9.9.9");
  });

  it("emits a result per finding but never for passing checks", () => {
    const ids = sarif.runs[0].results.map((r: { ruleId: string }) => r.ruleId);
    expect(ids).toContain("security_lint"); // fail
    expect(ids).toContain("tool_descriptions"); // warn
    expect(ids).toContain("probe.command-exec");
    expect(ids).toContain("probe.slow");
    expect(ids).not.toContain("mcp_handshake"); // passing — omitted
  });

  it("maps severities to SARIF levels", () => {
    const byId = Object.fromEntries(sarif.runs[0].results.map((r: { ruleId: string; level: string }) => [r.ruleId, r.level]));
    expect(byId["security_lint"]).toBe("error"); // fail
    expect(byId["tool_descriptions"]).toBe("warning"); // warn
    expect(byId["probe.command-exec"]).toBe("error"); // confirmed exploit
    expect(byId["probe.slow"]).toBe("note"); // soft
  });

  it("declares a rule for every emitted ruleId and carries fingerprints + locations", () => {
    const ruleIds = new Set(sarif.runs[0].tool.driver.rules.map((r: { id: string }) => r.id));
    for (const res of sarif.runs[0].results) {
      expect(ruleIds.has(res.ruleId)).toBe(true);
      expect(res.partialFingerprints.mcpcert).toMatch(/^[0-9a-f]{8}$/);
      expect(res.locations[0].physicalLocation.artifactLocation.uri).toContain("mcp-server:");
    }
  });

  it("attaches the tool name as a logical location for probe findings", () => {
    const exec = sarif.runs[0].results.find((r: { ruleId: string }) => r.ruleId === "probe.command-exec");
    expect(exec.locations[0].logicalLocations[0].name).toBe("run_cmd");
  });
});
