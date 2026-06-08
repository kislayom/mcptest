import { describe, expect, it } from "vitest";
import { leaderboardTable, rankCerts } from "../src/scan";
import type { CertResult } from "../src/score";

const c = (target: string, score: number): CertResult => ({
  target,
  score,
  grade: "A",
  certified: score >= 80,
  failed: 0,
});

describe("rankCerts", () => {
  it("sorts high to low by score", () => {
    const ranked = rankCerts([c("a", 40), c("b", 90), c("c", 70)]);
    expect(ranked.map((x) => x.target)).toEqual(["b", "c", "a"]);
  });
});

describe("leaderboardTable", () => {
  it("renders a header and a row per server", () => {
    const table = leaderboardTable(rankCerts([c("alpha", 90), c("beta", 50)]));
    expect(table).toContain("target");
    expect(table).toContain("alpha");
    expect(table).toContain("beta");
    expect(table.split("\n")).toHaveLength(3); // header + 2 rows
  });
});
