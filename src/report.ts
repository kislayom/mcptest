import pc from "picocolors";
import type { CertResult } from "./score.js";
import type { TestResult } from "./run.js";
import type { DoctorResult, Severity } from "./types.js";

const glyph: Record<Severity, string> = {
  pass: pc.green("✔"),
  warn: pc.yellow("▲"),
  fail: pc.red("✘"),
  info: pc.blue("ℹ"),
};

export function printReport(r: DoctorResult): void {
  const out: string[] = ["", pc.bold(`mcpcert doctor — ${r.target}`), ""];

  for (const c of r.checks) {
    out.push(`  ${glyph[c.severity]} ${c.title}`);
    out.push(`      ${pc.dim(c.detail)}`);
  }

  const pct = r.maxScore === 0 ? 0 : Math.round((r.score / r.maxScore) * 100);
  const scoreStr = `${r.score}/${r.maxScore} (${pct}%)`;
  const colored = pct >= 80 ? pc.green(scoreStr) : pct >= 50 ? pc.yellow(scoreStr) : pc.red(scoreStr);

  out.push("", pc.bold(`  Score: ${colored}`), "");
  process.stdout.write(out.join("\n") + "\n");
}

export function printScore(cert: CertResult): void {
  const scoreStr = `${cert.score}/100`;
  const colored = cert.score >= 80 ? pc.green(scoreStr) : cert.score >= 60 ? pc.yellow(scoreStr) : pc.red(scoreStr);
  const stamp = cert.certified ? pc.green("✓ Certified") : pc.red("✗ Not certified");

  const out: string[] = ["", pc.bold(`MCP Cert Score  ${colored}  (${cert.grade})   ${stamp}`), pc.dim(`  ${cert.target}`)];
  if (!cert.certified) {
    const t = cert.target.includes(" ") ? `"${cert.target}"` : cert.target;
    out.push(pc.dim(`  run 'mcpcert doctor ${t}' for the full breakdown`));
  }
  out.push("");
  process.stdout.write(out.join("\n") + "\n");
}

export function printRun(file: string, results: TestResult[]): void {
  const out: string[] = ["", pc.bold(file)];
  for (const r of results) {
    const g = r.passed ? pc.green("✔") : pc.red("✘");
    out.push(`  ${g} ${r.name}${r.passed ? "" : pc.dim(`  — ${r.detail}`)}`);
  }
  const passed = results.filter((r) => r.passed).length;
  const line = `  ${passed}/${results.length} passed`;
  out.push(passed === results.length ? pc.green(pc.bold(line)) : pc.red(pc.bold(line)), "");
  process.stdout.write(out.join("\n") + "\n");
}
