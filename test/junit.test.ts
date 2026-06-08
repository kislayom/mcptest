import { describe, expect, it } from "vitest";
import { junitXml } from "../src/junit";

describe("junitXml", () => {
  it("renders a suite with a passing and a failing case, escaping XML", () => {
    const xml = junitXml("suite", [
      { name: "a", passed: true, detail: "ok", durationMs: 10 },
      { name: "b & <stuff>", passed: false, detail: 'no "match"', durationMs: 20 },
    ]);
    expect(xml).toContain('tests="2"');
    expect(xml).toContain('failures="1"');
    expect(xml).toContain("<failure");
    expect(xml).toContain("&amp;");
    expect(xml).toContain("&lt;stuff&gt;");
    expect(xml).toContain("&quot;match&quot;");
  });
});
