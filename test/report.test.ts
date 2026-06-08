import { describe, expect, it, vi } from "vitest";
import { printReport } from "../src/report";

describe("printReport", () => {
  it("writes a score line", () => {
    const chunks: string[] = [];
    const spy = vi.spyOn(process.stdout, "write").mockImplementation((s: unknown) => {
      chunks.push(String(s));
      return true;
    });

    printReport({ target: "x", startedAt: "t", checks: [], score: 3, maxScore: 4 });
    spy.mockRestore();

    const out = chunks.join("");
    expect(out).toContain("Score:");
    expect(out).toContain("3/4");
  });
});
