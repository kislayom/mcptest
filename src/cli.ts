#!/usr/bin/env node
import { Command } from "commander";
import pc from "picocolors";
import { runDoctor } from "./doctor.js";
import { printReport } from "./report.js";

const program = new Command();

program
  .name("mcptest")
  .description("The test suite + trust layer for MCP servers")
  .version("0.0.1");

program
  .command("doctor")
  .argument("<target>", "MCP server URL (http/https). stdio command support is coming next.")
  .description("Zero-config, deterministic conformance + health scan of an MCP server")
  .option("--json", "output machine-readable JSON instead of the report")
  .action(async (target: string, opts: { json?: boolean }) => {
    const result = await runDoctor(target);
    if (opts.json) {
      process.stdout.write(JSON.stringify(result, null, 2) + "\n");
    } else {
      printReport(result);
    }
    // Non-zero exit when anything failed, so `doctor` can gate CI.
    const failed = result.checks.some((c) => c.severity === "fail");
    process.exit(failed ? 1 : 0);
  });

program.parseAsync(process.argv).catch((err: unknown) => {
  process.stderr.write(pc.red("mcptest: ") + (err instanceof Error ? err.message : String(err)) + "\n");
  process.exit(2);
});
