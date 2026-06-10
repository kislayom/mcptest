// Public library API for mcpcert. (Also ships a CLI — see `bin` / src/cli.ts.)

export { httpChecks, runDoctor } from "./doctor.js";
export { diffSnapshots, fingerprintTools, snapshot } from "./drift.js";
export type { ChangeKind, DriftChange, DriftReport, Snapshot, ToolFingerprint } from "./drift.js";
export { grade, gradeLetter, RUBRIC_VERSION } from "./grade.js";
export type { CapHit, Deduction, Dimension, DimensionScore, GradeInput, GradeSeverity, Letter, SecurityGrade } from "./grade.js";
export { junitXml } from "./junit.js";
export { lintTools, schemaIssue, secretIn } from "./lint.js";
export type { FindingKind, LintFinding, Tool } from "./lint.js";
export { certificationMarkdown } from "./markdown.js";
export type { ReportInput } from "./markdown.js";
export { checkExpectations, getByPath, loadTestFiles, runTestFile } from "./run.js";
export type { CallOutcome, Expectation, TestCase, TestFile, TestResult } from "./run.js";
export { leaderboardTable, rankCerts, scanTargets } from "./scan.js";
export { badgeMarkdown, badgeUrl, CERT_THRESHOLD, certify, gradeFor } from "./score.js";
export type { CertResult } from "./score.js";
export { generateProbes, minimalValid } from "./fuzz.js";
export type { Probe, ProbeCategory } from "./fuzz.js";
export { analyzeProbe, probeServer, stripEcho } from "./probe.js";
export type { ProbeFinding, ProbeOutcome, ProbeReport, Vuln } from "./probe.js";
export { assessRisks } from "./security.js";
export type { RiskFinding, RiskKind } from "./security.js";
export { addedCapabilities, annotateSemanticDrift, classifyPair, cosineSim, embedTexts, SEMANTIC_MODEL, SIM_THRESHOLD } from "./semantic.js";
export type { Advisory, SemanticAnnotation, SemanticKind, SemanticVerdict } from "./semantic.js";
export { classifyTarget, listToolsOf, openClient } from "./transport.js";
export type { OpenResult } from "./transport.js";
export type { CheckResult, DoctorResult, Severity } from "./types.js";
