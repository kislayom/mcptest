import { describe, expect, it } from "vitest";
import { validate } from "../src/validate";

const ok = (schema: unknown, value: unknown) => validate(schema, value).length === 0;

describe("validate", () => {
  it("checks primitive types and distinguishes integer from number", () => {
    expect(ok({ type: "string" }, "hi")).toBe(true);
    expect(ok({ type: "string" }, 3)).toBe(false);
    expect(ok({ type: "integer" }, 3)).toBe(true);
    expect(ok({ type: "integer" }, 3.5)).toBe(false);
    expect(ok({ type: "number" }, 3.5)).toBe(true);
    expect(ok({ type: "null" }, null)).toBe(true);
    expect(ok({ type: ["string", "null"] }, null)).toBe(true);
  });

  it("enforces required properties and recurses into them", () => {
    const schema = { type: "object", required: ["id", "name"], properties: { id: { type: "integer" }, name: { type: "string" } } };
    expect(ok(schema, { id: 1, name: "Ada" })).toBe(true);
    expect(validate(schema, { id: 1 })).toEqual([{ path: "$.name", message: "required property missing" }]);
    expect(validate(schema, { id: "x", name: "Ada" })[0].path).toBe("$.id");
  });

  it("honors additionalProperties:false", () => {
    const schema = { type: "object", properties: { a: { type: "string" } }, additionalProperties: false };
    expect(ok(schema, { a: "x" })).toBe(true);
    expect(validate(schema, { a: "x", b: 1 })[0]).toMatchObject({ path: "$.b", message: "additional property not allowed" });
  });

  it("validates array items and tuple items with indexed paths", () => {
    expect(ok({ type: "array", items: { type: "string" } }, ["a", "b"])).toBe(true);
    expect(validate({ type: "array", items: { type: "string" } }, ["a", 2])[0].path).toBe("$[1]");
    const tuple = { type: "array", items: [{ type: "string" }, { type: "integer" }] };
    expect(ok(tuple, ["a", 1])).toBe(true);
    expect(ok(tuple, ["a", "b"])).toBe(false);
  });

  it("checks enum and const", () => {
    expect(ok({ enum: ["a", "b"] }, "a")).toBe(true);
    expect(ok({ enum: ["a", "b"] }, "c")).toBe(false);
    expect(ok({ const: 42 }, 42)).toBe(true);
    expect(ok({ const: 42 }, 7)).toBe(false);
  });

  it("checks string length + pattern and number bounds", () => {
    expect(ok({ type: "string", minLength: 2, maxLength: 4 }, "abc")).toBe(true);
    expect(ok({ type: "string", minLength: 2 }, "a")).toBe(false);
    expect(ok({ type: "string", pattern: "^[a-z]+$" }, "abc")).toBe(true);
    expect(ok({ type: "string", pattern: "^[a-z]+$" }, "Abc")).toBe(false);
    expect(ok({ type: "number", minimum: 0, maximum: 10 }, 5)).toBe(true);
    expect(ok({ type: "number", minimum: 0 }, -1)).toBe(false);
    expect(ok({ type: "number", exclusiveMinimum: 0 }, 0)).toBe(false);
  });

  it("supports anyOf / oneOf", () => {
    expect(ok({ anyOf: [{ type: "string" }, { type: "integer" }] }, 3)).toBe(true);
    expect(ok({ anyOf: [{ type: "string" }, { type: "integer" }] }, true)).toBe(false);
    expect(ok({ oneOf: [{ type: "string" }, { const: "x" }] }, "x")).toBe(false); // matches both → not exactly one
    expect(ok({ oneOf: [{ type: "integer" }, { type: "string" }] }, 3)).toBe(true);
  });

  it("ignores unknown keywords and empty schemas (no false positives)", () => {
    expect(ok({}, { anything: true })).toBe(true);
    expect(ok({ title: "X", description: "Y", examples: [1] }, 1)).toBe(true);
  });

  it("collects nested violations with full paths", () => {
    const schema = {
      type: "object",
      properties: { user: { type: "object", required: ["age"], properties: { age: { type: "integer" } } } },
    };
    const errs = validate(schema, { user: { age: "old" } });
    expect(errs[0].path).toBe("$.user.age");
  });
});
