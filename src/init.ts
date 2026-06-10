/**
 * Scaffold a `*.mcpcert.yaml` test file from a server's advertised tools, so
 * adopting mcpcert is one command instead of hand-writing YAML. Deterministic:
 * it reads each tool's input schema and fills the required fields with
 * type-appropriate dummies (the same minimalValid the fuzzer uses), adds
 * `valid_output` when the tool declares an outputSchema, and leaves the rest for
 * the user to tighten.
 */
import { stringify } from "yaml";
import { minimalValid } from "./fuzz.js";
import type { Tool } from "./lint.js";

interface ScaffoldTest {
  name: string;
  tool: string;
  input?: Record<string, unknown>;
  expect: Record<string, unknown>;
}

/** Build a runnable *.mcpcert.yaml scaffold (as a string) from a tool list. */
export function scaffoldTests(server: string, tools: Tool[]): string {
  const tests: ScaffoldTest[] = tools.map((t) => {
    const schema = (t.inputSchema ?? {}) as Record<string, unknown>;
    const props = (schema.properties ?? {}) as Record<string, { type?: string }>;
    const required = Array.isArray(schema.required) ? (schema.required as string[]) : [];
    const input = minimalValid(props, required);

    const expect: Record<string, unknown> = { error: false };
    if ((t as { outputSchema?: unknown }).outputSchema != null) expect.valid_output = true;

    const base = { name: `${t.name} responds without error`, tool: t.name };
    return Object.keys(input).length > 0 ? { ...base, input, expect } : { ...base, expect };
  });

  const header =
    '# Scaffolded by `mcpcert init`. The example inputs are dummy values ("x", 1)\n' +
    "# generated from each tool's schema — adjust them to something meaningful,\n" +
    "# then run: mcpcert run\n";
  return header + stringify({ server, tests });
}
