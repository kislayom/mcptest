import type { TestResult } from "./run.js";

/** Render test results as JUnit XML — drop it into any CI that reads JUnit. */
export function junitXml(suite: string, results: TestResult[]): string {
  const failures = results.filter((r) => !r.passed).length;
  const cases = results
    .map((r) => {
      const t = (r.durationMs / 1000).toFixed(3);
      return r.passed
        ? `    <testcase name="${esc(r.name)}" time="${t}"/>`
        : `    <testcase name="${esc(r.name)}" time="${t}">\n      <failure message="${esc(r.detail)}"/>\n    </testcase>`;
    })
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>\n<testsuite name="${esc(suite)}" tests="${results.length}" failures="${failures}">\n${cases}\n</testsuite>\n`;
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
