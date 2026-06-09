import type { Tool } from "./lint.js";
import type { CheckResult, DoctorResult } from "./types.js";

export function pass(id: string, title: string, detail: string, pts: number): CheckResult {
  return { id, title, severity: "pass", detail, points: pts, maxPoints: pts };
}

export function warn(id: string, title: string, detail: string, pts: number, max: number): CheckResult {
  return { id, title, severity: "warn", detail, points: pts, maxPoints: max };
}

export function fail(id: string, title: string, detail: string, max: number): CheckResult {
  return { id, title, severity: "fail", detail, points: 0, maxPoints: max };
}

export function finalize(target: string, startedAt: string, checks: CheckResult[], tools?: Tool[]): DoctorResult {
  const score = checks.reduce((s, c) => s + c.points, 0);
  const maxScore = checks.reduce((s, c) => s + c.maxPoints, 0);
  return { target, startedAt, checks, score, maxScore, tools };
}
