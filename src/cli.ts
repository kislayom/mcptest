#!/usr/bin/env node
import { Command } from "commander";
import pc from "picocolors";
import { runDoctor } from "./doctor.js";
import { printReport, printScore } from "./report.js";
import { badgeMarkdown, certify } from "./score.js";

const program = new Command();

program
  .name("mcpcert")
  .description("The test suite + trust layer for MCP servers")
  .version("0.1.0");

program
  .command("doctor")
  .argument("<target>", "MCP server URL (http/https) or a stdio command (quote it)")
  .description("Zero-config, deterministic conformance + health scan of an MCP server")
  .option("--json", "output machine-readable JSON instead of the report")
  .action(async (target: string, opts: { json?: boolean }) => {
    const result = await runDoctor(target);
    if (opts.json) {
      process.stdout.write(JSON.stringify(result, null, 2) + "\n");
    } else {
      printReport(result);
    }
    const failed = result.checks.some((c) => c.severity === "fail");
    process.exit(failed ? 1 : 0);
  });

program
  .command("score")
  .argument("<target>", "MCP server URL (http/https) or a stdio command (quote it)")
  .description("Print the MCP Cert Score (0–100) for a server")
  .option("--json", "output machine-readable JSON")
  .option("--badge", "output a Markdown badge for your README")
  .action(async (target: string, opts: { json?: boolean; badge?: boolean }) => {
    const cert = certify(await runDoctor(target));
    if (opts.badge) {
      process.stdout.write(badgeMarkdown(cert) + "\n");
    } else if (opts.json) {
      process.stdout.write(JSON.stringify(cert, null, 2) + "\n");
    } else {
      printScore(cert);
    }
    process.exit(cert.certified ? 0 : 1);
  });

program.parseAsync(process.argv).catch((err: unknown) => {
  process.stderr.write(pc.red("mcpcert: ") + (err instanceof Error ? err.message : String(err)) + "\n");
  process.exit(2);
});
