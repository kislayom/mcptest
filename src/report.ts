import pc from "picocolors";
import type { DriftReport } from "./drift.js";
import type { ProbeReport } from "./probe.js";
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

  const g = cert.breakdown;
  if (g) {
    out.push(pc.dim(`  rubric ${g.rubric} · probed: ${g.assessed.probe ? "yes" : "no"}`), "");
    for (const d of g.dimensions) {
      const name = d.title.padEnd(22);
      if (!d.assessed) {
        out.push(pc.dim(`  ${name}    —   not assessed`));
        continue;
      }
      const s = String(d.score).padStart(3);
      const sc = d.score >= 80 ? pc.green(s) : d.score >= 60 ? pc.yellow(s) : pc.red(s);
      const issues = d.deductions.length ? pc.dim(`  ${d.deductions.length} issue(s)`) : "";
      out.push(`  ${name}  ${sc}  ${bar(d.score)}${issues}`);
    }
    for (const cap of g.caps) out.push(pc.red(`  ⚠ capped at ${cap.ceiling} — ${cap.reason}`));
    const hard = g.dimensions.flatMap((d) => d.deductions).filter((x) => x.severity === "critical" || x.severity === "high");
    if (hard.length > 0) {
      out.push("", pc.dim("  top findings:"));
      for (const x of hard.slice(0, 8)) out.push(pc.dim(`   • [${x.severity}] ${x.tool ? `${x.tool} — ` : ""}${x.detail}`));
    }
    if (!g.assessed.probe) {
      const t = cert.target.includes(" ") ? `"${cert.target}"` : cert.target;
      out.push("", pc.dim(`  robustness + exploitation not assessed — run: mcpcert probe ${t}`));
    }
  } else if (!cert.certified) {
    const t = cert.target.includes(" ") ? `"${cert.target}"` : cert.target;
    out.push(pc.dim(`  run 'mcpcert doctor ${t}' for the full breakdown`));
  }
  out.push("");
  process.stdout.write(out.join("\n") + "\n");
}

function bar(score: number): string {
  const n = Math.max(0, Math.min(12, Math.round((score / 100) * 12)));
  return pc.dim("█".repeat(n) + "░".repeat(12 - n));
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

export function printDrift(report: DriftReport): void {
  const out: string[] = ["", pc.bold(`mcpcert drift — ${report.target}`)];

  if (!report.drifted) {
    out.push(pc.green("  ✔ no drift — server matches the baseline"), "");
    process.stdout.write(out.join("\n") + "\n");
    return;
  }

  for (const c of report.changes) {
    const icon =
      c.kind === "suspicious"
        ? pc.red("⚠ SUSPICIOUS")
        : c.kind === "added"
          ? pc.yellow("+ added     ")
          : c.kind === "removed"
            ? pc.yellow("- removed   ")
            : pc.yellow("~ changed   ");
    out.push(`  ${icon}  ${c.tool}  ${pc.dim(c.detail)}`);
  }

  const head = report.suspicious
    ? pc.red(pc.bold(`  DRIFT DETECTED — possible rug-pull (${report.changes.length} change(s))`))
    : pc.yellow(pc.bold(`  drift detected (${report.changes.length} change(s))`));
  out.push("", head, "");
  process.stdout.write(out.join("\n") + "\n");
}

export function printProbe(report: ProbeReport): void {
  const out: string[] = ["", pc.bold(`mcpcert probe — ${report.target}`)];
  out.push(pc.dim(`  probed ${report.toolsProbed} tool(s), skipped ${report.toolsSkipped} mutating, ran ${report.probesRun} probe(s)`), "");

  if (report.findings.length === 0) {
    out.push(pc.green("  ✔ no vulnerabilities found"), "");
    process.stdout.write(out.join("\n") + "\n");
    return;
  }

  for (const f of report.findings) {
    const hard = !["weak-validation", "slow"].includes(f.vuln);
    const tag = hard ? pc.red(`✘ ${f.vuln}`) : pc.yellow(`▲ ${f.vuln}`);
    out.push(`  ${tag}  ${f.tool} [${f.category}]  ${pc.dim(f.detail)}`);
  }
  out.push("", pc.red(pc.bold(`  ${report.findings.length} finding(s)`)), "");
  process.stdout.write(out.join("\n") + "\n");
}
