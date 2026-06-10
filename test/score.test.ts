import { describe, expect, it } from "vitest";
import type { Tool } from "../src/lint";
import { badgeMarkdown, certify, gradeFor } from "../src/score";
import type { CheckResult, DoctorResult } from "../src/types";

const pass = (id: string): CheckResult => ({ id, title: id, severity: "pass", detail: "ok", points: 1, maxPoints: 1 });
const fail = (id: string, detail = ""): CheckResult => ({ id, title: id, severity: "fail", detail, points: 0, maxPoints: 1 });
const warn = (id: string, detail = ""): CheckResult => ({ id, title: id, severity: "warn", detail, points: 0, maxPoints: 2 });

const CLEAN = ["mcp_handshake", "tools_list", "tool_schemas", "tool_descriptions", "security_lint"].map(pass);
const ONE_TOOL: Tool[] = [{ name: "get_thing", description: "gets a thing", inputSchema: { type: "object" } }];

function doctor(checks: CheckResult[], tools: Tool[] = ONE_TOOL): DoctorResult {
  return { target: "x", startedAt: "t", checks, score: 0, maxScore: 0, tools };
}

describe("certify", () => {
  it("gives a clean server 100 / A / certified", () => {
    const c = certify(doctor(CLEAN));
    expect(c.score).toBe(100);
    expect(c.grade).toBe("A");
    expect(c.certified).toBe(true);
  });

  it("tanks and decertifies a server that fails the handshake", () => {
    const c = certify(doctor([fail("mcp_handshake", "connect failed")], []));
    expect(c.certified).toBe(false);
    expect(c.grade).toBe("F");
    expect(c.score).toBeLessThanOrEqual(25);
  });

  it("caps the grade when a tool description is poisoned (injection lint)", () => {
    const checks = [...CLEAN.filter((c) => c.id !== "security_lint"), fail("security_lint", "1 finding(s): t [injection] tells the agent to ignore prior instructions")];
    const c = certify(doctor(checks));
    expect(c.score).toBeLessThanOrEqual(55);
    expect(c.certified).toBe(false);
    expect(c.breakdown?.caps.length ?? 0).toBeGreaterThan(0);
  });

  it("still certifies with only a low-severity issue", () => {
    const checks = [...CLEAN.filter((c) => c.id !== "tool_descriptions"), warn("tool_descriptions", "1 without a description")];
    const c = certify(doctor(checks));
    expect(c.certified).toBe(true);
    expect(c.score).toBeGreaterThanOrEqual(80);
    expect(c.score).toBeLessThan(100);
  });

  it("attaches the explainable breakdown", () => {
    const c = certify(doctor(CLEAN));
    expect(c.breakdown?.rubric).toBeDefined();
    expect(c.breakdown?.dimensions.length).toBe(7);
  });
});

describe("gradeFor", () => {
  it("maps scores to letter grades", () => {
    expect(gradeFor(95)).toBe("A");
    expect(gradeFor(85)).toBe("B");
    expect(gradeFor(75)).toBe("C");
    expect(gradeFor(65)).toBe("D");
    expect(gradeFor(40)).toBe("F");
  });
});

describe("badgeMarkdown", () => {
  it("produces a shields.io markdown badge with the score", () => {
    const md = badgeMarkdown({ target: "x", score: 84, grade: "B", certified: true, failed: 0 });
    expect(md).toMatch(/^!\[MCP Cert\]\(https:\/\/img\.shields\.io\/badge\//);
    expect(md).toContain("84");
  });
});
