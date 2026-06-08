import { runDoctor } from "./doctor.js";
import { certify, type CertResult } from "./score.js";

/** Score many servers and return them ranked high-to-low. */
export async function scanTargets(targets: string[]): Promise<CertResult[]> {
  const out: CertResult[] = [];
  for (const target of targets) {
    try {
      out.push(certify(await runDoctor(target)));
    } catch {
      out.push({ target, score: 0, grade: "F", certified: false, failed: 0 });
    }
  }
  return rankCerts(out);
}

export function rankCerts(certs: CertResult[]): CertResult[] {
  return [...certs].sort((a, b) => b.score - a.score || a.target.localeCompare(b.target));
}

export function leaderboardTable(ranked: CertResult[]): string {
  const header = "  #   score  grade  cert  target";
  const rows = ranked.map((c, i) => {
    const rank = String(i + 1).padStart(2, " ");
    const score = `${c.score}/100`.padStart(7, " ");
    const cert = c.certified ? " ✓ " : "   ";
    return `${rank}. ${score}    ${c.grade}   ${cert}  ${c.target}`;
  });
  return [header, ...rows].join("\n");
}
