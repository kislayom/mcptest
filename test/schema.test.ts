import { describe, expect, it } from "vitest";
import { schemaIssue } from "../src/lint";

describe("schemaIssue (recursive)", () => {
  it("accepts a nested object schema", () => {
    expect(
      schemaIssue({
        type: "object",
        properties: { a: { type: "string" }, b: { type: "object", properties: { c: { type: "number" } } } },
      }),
    ).toBeNull();
  });

  it("flags an invalid nested type", () => {
    expect(schemaIssue({ type: "object", properties: { a: { type: "stringy" } } })).toMatch(/invalid value/);
  });

  it("flags a non-object property schema", () => {
    expect(schemaIssue({ type: "object", properties: { a: "nope" } })).toMatch(/must be an object schema/);
  });

  it("flags a bad items schema inside an array property", () => {
    expect(schemaIssue({ type: "object", properties: { tags: { type: "array", items: { type: 5 } } } })).toMatch(/invalid value/);
  });
});
