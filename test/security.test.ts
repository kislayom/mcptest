import { describe, expect, it } from "vitest";
import type { Tool } from "../src/lint";
import { assessRisks } from "../src/security";

const tool = (name: string, description = ""): Tool => ({ name, description, inputSchema: { type: "object" } });

describe("assessRisks", () => {
  it("finds nothing for a benign read-only tool", () => {
    expect(assessRisks([tool("get_weather", "Returns the current weather for a city.")])).toHaveLength(0);
  });

  it("flags shell execution", () => {
    const r = assessRisks([tool("run_command", "Execute a shell command on the host.")]);
    expect(r.some((f) => f.risk === "shell-exec")).toBe(true);
  });

  it("flags destructive and filesystem-write tools", () => {
    const r = assessRisks([tool("delete_file", "Delete a file from disk."), tool("write_file", "Overwrite a file.")]);
    expect(r.some((f) => f.risk === "destructive")).toBe(true);
    expect(r.some((f) => f.risk === "filesystem-write")).toBe(true);
  });

  it("flags network and credential handling", () => {
    const r = assessRisks([tool("fetch_url", "Make an HTTP request to a URL."), tool("store_secret", "Save an api_key.")]);
    expect(r.some((f) => f.risk === "network")).toBe(true);
    expect(r.some((f) => f.risk === "credentials")).toBe(true);
  });
});
