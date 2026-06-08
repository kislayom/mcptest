import { describe, expect, it } from "vitest";
import { badgeMarkdown, certify, gradeFor } from "../src/score";
import type { CheckResult, DoctorResult } from "../src/types";

function result(score: number, max: number, fails = 0): DoctorResult {
  const checks: CheckResult[] = Array.from({ length: fails }, (_, i) => ({
    id: `f${i}`,
    title: "x",
    severity: "fail",
    detail: "",
    points: 0,
    maxPoints: 1,
  }));
  return { target: "x", startedAt: "t", checks, score, maxScore: max };
}

describe("certify", () => {
  it("scores as a 0–100 percentage", () => {
    expect(certify(result(22, 22)).score).toBe(100);
    expect(certify(result(5, 12)).score).toBe(42);
    expect(certify(result(0, 0)).score).toBe(0);
  });

  it("certifies at >= 80 with no failures", () => {
    expect(certify(result(8, 10)).certified).toBe(true);
    expect(certify(result(9, 10)).certified).toBe(true);
  });

  it("does not certify below 80", () => {
    expect(certify(result(7, 10)).certified).toBe(false);
  });

  it("does not certify if any check fails, even at a high score", () => {
    expect(certify(result(95, 100, 1)).certified).toBe(false);
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
    const md = badgeMarkdown(certify(result(84, 100)));
    expect(md).toMatch(/^!\[MCP Cert\]\(https:\/\/img\.shields\.io\/badge\//);
    expect(md).toContain("84");
  });
});
