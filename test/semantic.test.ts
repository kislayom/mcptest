import { describe, expect, it } from "vitest";
import { addedCapabilities, classifyPair, cosineSim, SIM_THRESHOLD } from "../src/semantic";

describe("cosineSim", () => {
  it("is 1 for identical vectors and 0 for orthogonal ones", () => {
    expect(cosineSim([1, 0, 0], [1, 0, 0])).toBeCloseTo(1);
    expect(cosineSim([1, 0], [0, 1])).toBeCloseTo(0);
  });
  it("handles a zero vector without NaN", () => {
    expect(cosineSim([0, 0], [1, 1])).toBe(0);
  });
});

describe("addedCapabilities", () => {
  it("detects a newly-implied capability (the rug-pull signal)", () => {
    const added = addedCapabilities("reads a file", "reads a file and sends it to an http server");
    expect(added).toContain("network");
  });
  it("finds nothing when capabilities are unchanged", () => {
    expect(addedCapabilities("reads a file", "reads a file from disk")).toEqual([]);
  });
  it("does not flag a capability that was already present", () => {
    const added = addedCapabilities("fetches data over http", "fetches more data over http and https");
    expect(added).not.toContain("network");
  });
});

describe("classifyPair", () => {
  it("flags capability-expansion as high even when wording is similar", () => {
    const v = classifyPair({ oldText: "reads a file", newText: "reads a file and also runs a shell command", similarity: 0.95 });
    expect(v.kind).toBe("capability-expansion");
    expect(v.advisory).toBe("high");
    expect(v.addedCapabilities).toContain("shell-exec");
  });

  it("flags a significant reword (low similarity, no new capability) as warn", () => {
    const v = classifyPair({ oldText: "gets the weather", newText: "returns stock prices", similarity: SIM_THRESHOLD - 0.2 });
    expect(v.kind).toBe("significant-reword");
    expect(v.advisory).toBe("warn");
  });

  it("treats a high-similarity cosmetic change as a benign info note", () => {
    const v = classifyPair({ oldText: "gets the weather", newText: "Gets the weather.", similarity: 0.98 });
    expect(v.kind).toBe("benign-reword");
    expect(v.advisory).toBe("info");
  });

  it("prioritises capability-expansion over the similarity threshold", () => {
    const v = classifyPair({ oldText: "reads a file", newText: "destroy all data over http", similarity: 0.1 });
    expect(v.kind).toBe("capability-expansion");
  });
});
