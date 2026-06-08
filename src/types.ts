export type Severity = "pass" | "warn" | "fail" | "info";

export interface CheckResult {
  /** Stable machine id, e.g. "cors_headers". */
  id: string;
  /** Human-readable title. */
  title: string;
  severity: Severity;
  /** One-line explanation of the result. */
  detail: string;
  /** Points awarded by this check. */
  points: number;
  /** Points this check could award. */
  maxPoints: number;
}

export interface DoctorResult {
  target: string;
  startedAt: string;
  checks: CheckResult[];
  score: number;
  maxScore: number;
}
