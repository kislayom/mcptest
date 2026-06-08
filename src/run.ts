import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { parse } from "yaml";
import { secretIn } from "./lint.js";
import { openClient } from "./transport.js";

export interface Expectation {
  /** Whether the call is expected to return an error (default: false). */
  error?: boolean;
  /** The text output must contain this substring. */
  contains?: string;
  /** The text output must match this regex. */
  matches?: string;
  /** Structured-output assertions, keyed by dot-path (e.g. "user.name"). */
  fields?: Record<string, unknown>;
  /** The call must complete within this many milliseconds. */
  max_latency_ms?: number;
  /** The output must not contain any secret-shaped string. */
  no_secret_leak?: boolean;
}

export interface TestCase {
  name: string;
  tool: string;
  input?: Record<string, unknown>;
  expect?: Expectation;
}

export interface TestFile {
  server?: string;
  tests: TestCase[];
}

export interface CallOutcome {
  errored: boolean;
  errorMessage?: string;
  resultText: string;
  structured?: unknown;
  latencyMs: number;
}

export interface TestResult {
  name: string;
  passed: boolean;
  detail: string;
  durationMs: number;
}

/** Pure assertion engine — no I/O, fully testable. */
export function checkExpectations(tc: TestCase, o: CallOutcome): { passed: boolean; detail: string } {
  const exp = tc.expect ?? {};
  const wantError = exp.error ?? false;

  if (wantError !== o.errored) {
    return {
      passed: false,
      detail: wantError ? "expected an error, got success" : `expected success, got error: ${o.errorMessage ?? "unknown"}`,
    };
  }
  if (exp.contains != null && !o.resultText.includes(exp.contains)) {
    return { passed: false, detail: `result does not contain "${exp.contains}"` };
  }
  if (exp.matches != null && !new RegExp(exp.matches).test(o.resultText)) {
    return { passed: false, detail: `result does not match /${exp.matches}/` };
  }
  if (exp.fields) {
    const source = o.structured ?? safeParse(o.resultText);
    for (const [path, want] of Object.entries(exp.fields)) {
      const got = getByPath(source, path);
      if (!deepEqual(got, want)) {
        return { passed: false, detail: `field "${path}" expected ${JSON.stringify(want)}, got ${JSON.stringify(got)}` };
      }
    }
  }
  if (exp.no_secret_leak) {
    const leak = secretIn(o.resultText);
    if (leak) return { passed: false, detail: `output leaks a ${leak}` };
  }
  if (exp.max_latency_ms != null && o.latencyMs > exp.max_latency_ms) {
    return { passed: false, detail: `took ${o.latencyMs}ms, over the ${exp.max_latency_ms}ms budget` };
  }
  return { passed: true, detail: "ok" };
}

export function getByPath(obj: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>((acc, key) => {
    if (acc == null || typeof acc !== "object") return undefined;
    return (acc as Record<string, unknown>)[key];
  }, obj);
}

export function loadTestFiles(pathArg?: string): { file: string; spec: TestFile }[] {
  const files: string[] = [];
  if (pathArg) {
    files.push(pathArg);
  } else {
    for (const f of readdirSync(process.cwd())) {
      if (f.endsWith(".mcpcert.yaml") || f.endsWith(".mcpcert.yml")) files.push(join(process.cwd(), f));
    }
  }
  return files.map((file) => ({ file, spec: parse(readFileSync(file, "utf8")) as TestFile }));
}

export async function runTestFile(spec: TestFile, serverOverride?: string): Promise<TestResult[]> {
  const server = serverOverride ?? spec.server;
  if (!server) throw new Error("no server specified (set 'server:' in the test file or pass a target)");

  const results: TestResult[] = [];
  const opened = await openClient(server);
  try {
    for (const tc of spec.tests ?? []) {
      const outcome = await callTool(opened.client, tc);
      const { passed, detail } = checkExpectations(tc, outcome);
      results.push({ name: tc.name, passed, detail, durationMs: outcome.latencyMs });
    }
  } finally {
    await opened.close();
  }
  return results;
}

async function callTool(client: Client, tc: TestCase): Promise<CallOutcome> {
  const t0 = Date.now();
  try {
    const res = await client.callTool({ name: tc.tool, arguments: tc.input ?? {} });
    const latencyMs = Date.now() - t0;
    const resultText = text(res.content);
    return {
      errored: res.isError === true,
      errorMessage: res.isError === true ? resultText : undefined,
      resultText,
      structured: (res as { structuredContent?: unknown }).structuredContent,
      latencyMs,
    };
  } catch (e) {
    return { errored: true, errorMessage: e instanceof Error ? e.message : String(e), resultText: "", latencyMs: Date.now() - t0 };
  }
}

function text(content: unknown): string {
  try {
    return JSON.stringify(content);
  } catch {
    return String(content);
  }
}

function deepEqual(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function safeParse(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch {
    return undefined;
  }
}
