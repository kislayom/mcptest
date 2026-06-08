import pc from "picocolors";
import type { DoctorResult, Severity } from "./types.js";

const glyph: Record<Severity, string> = {
  pass: pc.green("✔"),
  warn: pc.yellow("▲"),
  fail: pc.red("✘"),
  info: pc.blue("ℹ"),
};

export function printReport(r: DoctorResult): void {
  const out: string[] = ["", pc.bold(`mcptest doctor — ${r.target}`), ""];

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
