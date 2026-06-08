#!/usr/bin/env node
import { readFileSync, writeFileSync } from "node:fs";
import { Command } from "commander";
import pc from "picocolors";
import { diffSnapshots, snapshot, type Snapshot } from "./drift.js";
import { runDoctor } from "./doctor.js";
import { junitXml } from "./junit.js";
import { certificationMarkdown } from "./markdown.js";
import { printDrift, printReport, printRun, printScore } from "./report.js";
import { loadTestFiles, runTestFile, type TestResult } from "./run.js";
import { leaderboardTable, scanTargets } from "./scan.js";
import { badgeMarkdown, certify } from "./score.js";
import { assessRisks } from "./security.js";
import { listToolsOf } from "./transport.js";

const program = new Command();

program
  .name("mcpcert")
  .description("The test suite + trust layer for MCP servers")
  .version("0.5.0");

program
  .command("doctor")
  .argument("<target>", "MCP server URL (http/https) or a stdio command (quote it)")
  .description("Zero-config, deterministic conformance + health scan of an MCP server")
  .option("--json", "output machine-readable JSON instead of the report")
  .action(async (target: string, opts: { json?: boolean }) => {
    const result = await runDoctor(target);
    if (opts.json) process.stdout.write(JSON.stringify(result, null, 2) + "\n");
    else printReport(result);
    process.exit(result.checks.some((c) => c.severity === "fail") ? 1 : 0);
  });

program
  .command("score")
  .argument("<target>", "MCP server URL (http/https) or a stdio command (quote it)")
  .description("Print the MCP Cert Score (0–100) for a server")
  .option("--json", "output machine-readable JSON")
  .option("--badge", "output a Markdown badge for your README")
  .action(async (target: string, opts: { json?: boolean; badge?: boolean }) => {
    const cert = certify(await runDoctor(target));
    if (opts.badge) process.stdout.write(badgeMarkdown(cert) + "\n");
    else if (opts.json) process.stdout.write(JSON.stringify(cert, null, 2) + "\n");
    else printScore(cert);
    process.exit(cert.certified ? 0 : 1);
  });

program
  .command("report")
  .argument("<target>", "MCP server URL (http/https) or a stdio command (quote it)")
  .description("Generate a full Markdown certification report (checks, tools, capability risk)")
  .option("-o, --out <file>", "write the report to a file (default: stdout)")
  .action(async (target: string, opts: { out?: string }) => {
    const result = await runDoctor(target);
    const cert = certify(result);
    const tools = await listToolsOf(target);
    const md = certificationMarkdown({ target, result, cert, tools, risks: assessRisks(tools) });
    if (opts.out) {
      writeFileSync(opts.out, md);
      process.stderr.write(`report written to ${opts.out}\n`);
    } else {
      process.stdout.write(md);
    }
    process.exit(cert.certified ? 0 : 1);
  });

program
  .command("run")
  .argument("[target]", "server URL/command; overrides the 'server:' field in the test files")
  .description("Run *.mcpcert.yaml test files against an MCP server")
  .option("--file <path>", "a specific test file (default: *.mcpcert.yaml in the current directory)")
  .option("--reporter <kind>", "pretty (default) or junit")
  .action(async (target: string | undefined, opts: { file?: string; reporter?: string }) => {
    const files = loadTestFiles(opts.file);
    if (files.length === 0) {
      process.stderr.write("mcpcert run: no *.mcpcert.yaml test files found\n");
      process.exit(2);
    }
    const all: TestResult[] = [];
    for (const { file, spec } of files) {
      const results = await runTestFile(spec, target);
      all.push(...results);
      if (opts.reporter !== "junit") printRun(file, results);
    }
    if (opts.reporter === "junit") process.stdout.write(junitXml("mcpcert", all));
    process.exit(all.some((r) => !r.passed) ? 1 : 0);
  });

program
  .command("scan")
  .argument("[targets...]", "MCP server URLs/commands to score")
  .description("Score multiple MCP servers and print a leaderboard")
  .option("--file <path>", "read targets from a file (one per line; # comments allowed)")
  .option("--json", "output machine-readable JSON")
  .action(async (targets: string[], opts: { file?: string; json?: boolean }) => {
    const list = [...(targets ?? [])];
    if (opts.file) list.push(...readLines(opts.file));
    if (list.length === 0) {
      process.stderr.write("mcpcert scan: no targets given\n");
      process.exit(2);
    }
    const ranked = await scanTargets(list);
    if (opts.json) process.stdout.write(JSON.stringify(ranked, null, 2) + "\n");
    else process.stdout.write("\n" + leaderboardTable(ranked) + "\n\n");
    process.exit(0);
  });

program
  .command("snapshot")
  .argument("<target>", "MCP server URL (http/https) or a stdio command (quote it)")
  .description("Capture a baseline fingerprint of a server's tools (for drift detection)")
  .option("-o, --out <file>", "write the snapshot JSON to a file (default: stdout)")
  .action(async (target: string, opts: { out?: string }) => {
    const snap = await snapshot(target);
    const json = JSON.stringify(snap, null, 2);
    if (opts.out) {
      writeFileSync(opts.out, json + "\n");
      process.stderr.write(`snapshot written to ${opts.out} (${snap.tools.length} tool(s))\n`);
    } else {
      process.stdout.write(json + "\n");
    }
  });

program
  .command("diff")
  .argument("<target>", "MCP server URL (http/https) or a stdio command (quote it)")
  .requiredOption("--baseline <file>", "a snapshot file produced by 'mcpcert snapshot'")
  .description("Detect drift: compare a live server against a saved snapshot (the rug-pull check)")
  .option("--json", "output machine-readable JSON")
  .action(async (target: string, opts: { baseline: string; json?: boolean }) => {
    const baseline = JSON.parse(readFileSync(opts.baseline, "utf8")) as Snapshot;
    const report = diffSnapshots(baseline, await snapshot(target));
    if (opts.json) process.stdout.write(JSON.stringify(report, null, 2) + "\n");
    else printDrift(report);
    process.exit(report.drifted ? 1 : 0);
  });

program.parseAsync(process.argv).catch((err: unknown) => {
  process.stderr.write(pc.red("mcpcert: ") + (err instanceof Error ? err.message : String(err)) + "\n");
  process.exit(2);
});

function readLines(path: string): string[] {
  return readFileSync(path, "utf8")
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !l.startsWith("#"));
}
