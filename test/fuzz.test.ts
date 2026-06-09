import { describe, expect, it } from "vitest";
import { generateProbes, minimalValid } from "../src/fuzz";
import type { Tool } from "../src/lint";

const tool: Tool = {
  name: "read_file",
  description: "reads a file",
  inputSchema: {
    type: "object",
    properties: { path: { type: "string" }, n: { type: "number" } },
    required: ["path"],
  },
};

describe("generateProbes", () => {
  it("includes a valid baseline plus adversarial categories", () => {
    const cats = generateProbes(tool).map((p) => p.category);
    expect(cats).toContain("valid");
    expect(cats).toContain("missing-required");
    expect(cats).toContain("type-violation");
    expect(cats).toContain("injection");
    expect(cats).toContain("path-traversal");
    expect(cats).toContain("oversized");
    expect(cats).toContain("command-injection");
    expect(cats).toContain("ssrf");
    expect(cats).toContain("sql-injection");
  });

  it("puts the injection payload in a string field", () => {
    const inj = generateProbes(tool).find((p) => p.category === "injection");
    expect(typeof inj?.args.path).toBe("string");
    expect(String(inj?.args.path)).toMatch(/ignore all previous/i);
  });

  it("flips the type of a required field for the type-violation probe", () => {
    const tv = generateProbes(tool).find((p) => p.category === "type-violation");
    expect(typeof tv?.args.path).toBe("number");
  });
});

describe("minimalValid", () => {
  it("fills required fields with type-appropriate dummies", () => {
    const v = minimalValid({ a: { type: "string" }, b: { type: "number" } }, ["a", "b"]);
    expect(v).toEqual({ a: "x", b: 1 });
  });
});
