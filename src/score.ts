import type { DoctorResult } from "./types.js";

export interface CertResult {
  target: string;
  /** 0–100 */
  score: number;
  grade: "A" | "B" | "C" | "D" | "F";
  /** score >= 80 AND zero failing checks */
  certified: boolean;
  /** number of fail-severity checks */
  failed: number;
}

/** A server must clear this score AND have no hard failures to be "Certified". */
export const CERT_THRESHOLD = 80;

export function certify(result: DoctorResult): CertResult {
  const score = result.maxScore > 0 ? Math.round((result.score / result.maxScore) * 100) : 0;
  const failed = result.checks.filter((c) => c.severity === "fail").length;
  return {
    target: result.target,
    score,
    grade: gradeFor(score),
    certified: score >= CERT_THRESHOLD && failed === 0,
    failed,
  };
}

export function gradeFor(score: number): CertResult["grade"] {
  if (score >= 90) return "A";
  if (score >= 80) return "B";
  if (score >= 70) return "C";
  if (score >= 60) return "D";
  return "F";
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
