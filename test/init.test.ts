import { describe, expect, it } from "vitest";
import { parse } from "yaml";
import { scaffoldTests } from "../src/init";
import type { Tool } from "../src/lint";

const tools: Tool[] = [
  { name: "read_file", description: "reads", inputSchema: { type: "object", properties: { path: { type: "string" }, n: { type: "number" } }, required: ["path"] } },
  { name: "ping", description: "no args", inputSchema: { type: "object", properties: {} } },
  { name: "get_user", inputSchema: { type: "object", properties: { id: { type: "integer" } }, required: ["id"] }, outputSchema: { type: "object" } } as Tool,
];

describe("scaffoldTests", () => {
  const yaml = scaffoldTests("node server.js", tools);
  const spec = parse(yaml);
  const byTool = (name: string) => spec.tests.find((t: { tool: string }) => t.tool === name);

  it("sets the server and one test per tool", () => {
    expect(spec.server).toBe("node server.js");
    expect(spec.tests).toHaveLength(3);
    expect(spec.tests.map((t: { tool: string }) => t.tool)).toEqual(["read_file", "ping", "get_user"]);
  });

  it("fills only required fields with type-appropriate dummies", () => {
    expect(byTool("read_file").input).toEqual({ path: "x" });
    expect(byTool("read_file").expect).toEqual({ error: false });
  });

  it("omits input when the tool takes no required args", () => {
    expect(byTool("ping").input).toBeUndefined();
  });

  it("adds valid_output when the tool declares an outputSchema", () => {
    expect(byTool("get_user").expect.valid_output).toBe(true);
    expect(byTool("get_user").input).toEqual({ id: 1 });
  });

  it("starts with a guidance comment", () => {
    expect(yaml.startsWith("#")).toBe(true);
  });
});
