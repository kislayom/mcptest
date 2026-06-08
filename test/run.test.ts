import { describe, expect, it } from "vitest";
import { checkExpectations, getByPath, type CallOutcome } from "../src/run";

const ok: CallOutcome = {
  errored: false,
  resultText: '{"content":[{"type":"text","text":"hello world"}]}',
  structured: { ok: true, items: ["a"], user: { name: "kk" } },
  latencyMs: 5,
};
const err: CallOutcome = { errored: true, errorMessage: "boom", resultText: "", latencyMs: 3 };

describe("checkExpectations", () => {
  it("passes when success is expected and returned", () => {
    expect(checkExpectations({ name: "t", tool: "x" }, ok).passed).toBe(true);
  });

  it("fails when an unexpected error occurs", () => {
    expect(checkExpectations({ name: "t", tool: "x" }, err).passed).toBe(false);
  });

  it("passes when an error is expected and returned", () => {
    expect(checkExpectations({ name: "t", tool: "x", expect: { error: true } }, err).passed).toBe(true);
  });

  it("honors contains / matches", () => {
    expect(checkExpectations({ name: "t", tool: "x", expect: { contains: "hello" } }, ok).passed).toBe(true);
    expect(checkExpectations({ name: "t", tool: "x", expect: { contains: "absent" } }, ok).passed).toBe(false);
    expect(checkExpectations({ name: "t", tool: "x", expect: { matches: "h.llo" } }, ok).passed).toBe(true);
  });

  it("checks structured-output fields by dot-path", () => {
    expect(checkExpectations({ name: "t", tool: "x", expect: { fields: { ok: true } } }, ok).passed).toBe(true);
    expect(checkExpectations({ name: "t", tool: "x", expect: { fields: { ok: false } } }, ok).passed).toBe(false);
    expect(checkExpectations({ name: "t", tool: "x", expect: { fields: { "user.name": "kk" } } }, ok).passed).toBe(true);
  });

  it("enforces a latency budget", () => {
    expect(checkExpectations({ name: "t", tool: "x", expect: { max_latency_ms: 10 } }, { ...ok, latencyMs: 50 }).passed).toBe(false);
    expect(checkExpectations({ name: "t", tool: "x", expect: { max_latency_ms: 100 } }, ok).passed).toBe(true);
  });

  it("flags secret leakage in the output", () => {
    const leaky: CallOutcome = { ...ok, resultText: "use token sk-ABCDEFGHIJKLMNOPQRSTUVWX now" };
    expect(checkExpectations({ name: "t", tool: "x", expect: { no_secret_leak: true } }, leaky).passed).toBe(false);
    expect(checkExpectations({ name: "t", tool: "x", expect: { no_secret_leak: true } }, ok).passed).toBe(true);
  });
});

describe("getByPath", () => {
  it("resolves nested keys and returns undefined for missing paths", () => {
    expect(getByPath({ a: { b: { c: 1 } } }, "a.b.c")).toBe(1);
    expect(getByPath({ a: 1 }, "a.b")).toBeUndefined();
  });
});
