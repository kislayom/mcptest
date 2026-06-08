import { describe, expect, it } from "vitest";
import { checkExpectations, type CallOutcome } from "../src/run";

const ok: CallOutcome = { errored: false, resultText: '{"content":[{"type":"text","text":"hello world"}]}' };
const err: CallOutcome = { errored: true, errorMessage: "boom", resultText: "" };

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

  it("honors `contains`", () => {
    expect(checkExpectations({ name: "t", tool: "x", expect: { contains: "hello" } }, ok).passed).toBe(true);
    expect(checkExpectations({ name: "t", tool: "x", expect: { contains: "absent" } }, ok).passed).toBe(false);
  });

  it("honors `matches`", () => {
    expect(checkExpectations({ name: "t", tool: "x", expect: { matches: "h.llo" } }, ok).passed).toBe(true);
    expect(checkExpectations({ name: "t", tool: "x", expect: { matches: "^zzz" } }, ok).passed).toBe(false);
  });
});
