import { CERT_THRESHOLD, grade, gradeLetter, type Letter, type SecurityGrade } from "./grade.js";
import type { ProbeReport } from "./probe.js";
import type { DoctorResult } from "./types.js";

export interface CertResult {
  target: string;
  /** 0–100, from the security-grade rubric (see grade.ts / docs/SCORING.md) */
  score: number;
  grade: Letter;
  /** score >= threshold, no hard caps, and no critical/high findings */
  certified: boolean;
  /** number of fail-severity doctor checks (kept for back-compat reporting) */
  failed: number;
  /** the full, explainable grade breakdown */
  breakdown?: SecurityGrade;
}

export { CERT_THRESHOLD };

/**
 * Turn a doctor result (optionally enriched with an active probe report) into a
 * certification summary. The score is the threat-model-grounded grade — not a
 * sum of check points. Pass the probe report to fold active-attack evidence
 * (robustness + exploitation) into the grade.
 */
export function certify(result: DoctorResult, probe?: ProbeReport): CertResult {
  const breakdown = grade({ doctor: result, probe });
  const failed = result.checks.filter((c) => c.severity === "fail").length;
  return {
    target: result.target,
    score: breakdown.score,
    grade: breakdown.grade,
    certified: breakdown.certified,
    failed,
    breakdown,
  };
}

/** Back-compat: map a 0–100 score to a letter grade. */
export function gradeFor(score: number): Letter {
  return gradeLetter(score);
}

function badgeColor(score: number): string {
  if (score >= 90) return "brightgreen";
  if (score >= 80) return "green";
  if (score >= 70) return "yellowgreen";
  if (score >= 60) return "yellow";
  if (score >= 40) return "orange";
  return "red";
}

/** A shields.io static-badge URL for the score. */
export function badgeUrl(cert: CertResult): string {
  const label = encodeURIComponent("MCP Cert");
  const message = encodeURIComponent(`${cert.score}/100`);
  return `https://img.shields.io/badge/${label}-${message}-${badgeColor(cert.score)}`;
}

/** A Markdown badge a maintainer can drop straight into a README. */
export function badgeMarkdown(cert: CertResult): string {
  return `![MCP Cert](${badgeUrl(cert)})`;
}
