/**
 * mcpcert security grade — a threat-model-grounded, explainable rubric.
 *
 * The headline number is NOT a sum of arbitrary check points. It is a penalty
 * model over six dimensions of the MCP threat model, where:
 *
 *   - each finding deducts points by SEVERITY (critical/high/medium/low),
 *   - deductions are AMPLIFIED by the blast radius of the tool they hit — a weak
 *     check on `delete_file` is worse than the same on `get_weather`,
 *   - a single CONFIRMED exploit (RCE / SSRF / path-traversal), a server crash,
 *     a secret leak, or a poisoned tool description CAPS the whole grade, the way
 *     a real security review lets one critical dominate,
 *   - dimensions we did not actually test (robustness + exploitation need an
 *     active probe) are marked "not assessed" and excluded from the average — we
 *     never claim a server is robust on evidence we don't have.
 *
 * Everything here is pure and deterministic: no LLM, no network. Inputs are the
 * doctor result, the server's tool list (for blast-radius weighting, carried on
 * the doctor result) and an optional probe report (the active-attack evidence).
 *
 * The rubric is versioned (RUBRIC_VERSION); two scans are only comparable when
 * their rubric matches. Every weight below is documented in docs/SCORING.md.
 */
import { assessRisks, type RiskKind } from "./security.js";
import type { ProbeReport } from "./probe.js";
import type { CheckResult, DoctorResult } from "./types.js";

export const RUBRIC_VERSION = "1.0";
export const CERT_THRESHOLD = 80;
/** No single assessed dimension may fall below this and still be Certified. */
export const CERT_DIM_FLOOR = 50;

export type Dimension =
  | "conformance"
  | "interface"
  | "injection"
  | "robustness"
  | "confidentiality"
  | "exploitation";

export type GradeSeverity = "critical" | "high" | "medium" | "low";
export type Letter = "A" | "B" | "C" | "D" | "F";

export interface Deduction {
  dimension: Dimension;
  severity: GradeSeverity;
  /** points removed from the dimension AFTER blast-radius weighting */
  points: number;
  tool?: string;
  detail: string;
}

export interface DimensionScore {
  dimension: Dimension;
  title: string;
  /** false when we had no evidence to judge it (e.g. no probe was run) */
  assessed: boolean;
  /** 0–100; 100 when assessed and clean */
  score: number;
  /** share of the overall, renormalised across the assessed dimensions */
  weight: number;
  deductions: Deduction[];
}

export interface CapHit {
  dimension: Dimension;
  ceiling: number;
  reason: string;
}

export interface SecurityGrade {
  target: string;
  rubric: string;
  /** 0–100 overall */
  score: number;
  grade: Letter;
  certified: boolean;
  dimensions: DimensionScore[];
  /** ceilings applied because a serious issue dominates the grade */
  caps: CapHit[];
  assessed: { protocol: boolean; probe: boolean };
}

export interface GradeInput {
  doctor: DoctorResult;
  probe?: ProbeReport;
}

const TITLE: Record<Dimension, string> = {
  conformance: "Protocol conformance",
  interface: "Interface quality",
  injection: "Injection resistance",
  robustness: "Input robustness",
  confidentiality: "Confidentiality",
  exploitation: "Exploitation",
};

/** Base penalty per severity, before blast-radius weighting. See SCORING.md. */
const BASE: Record<GradeSeverity, number> = { critical: 60, high: 35, medium: 18, low: 7 };

/** Relative importance of each dimension (renormalised over the assessed ones). */
const DIM_WEIGHT: Record<Dimension, number> = {
  conformance: 0.2,
  interface: 0.15,
  injection: 0.2,
  robustness: 0.15,
  confidentiality: 0.15,
  exploitation: 0.15,
};

/** Blast radius: how much worse a flaw is on a high-capability tool. */
const RISK_WEIGHT: Record<RiskKind, number> = {
  "shell-exec": 2,
  destructive: 2,
  credentials: 2,
  "filesystem-write": 1.5,
  network: 1.5,
};

/** A single serious issue dominates — these cap the OVERALL score. */
const CEIL_EXPLOIT = 15;
const CEIL_UNREACHABLE = 25;
const CEIL_LEAK = 40;
const CEIL_CRASH = 45;
const CEIL_INJECTION = 55;

const ORDER = Object.keys(DIM_WEIGHT) as Dimension[];

interface Raw {
  dimension: Dimension;
  severity: GradeSeverity;
  detail: string;
  tool?: string;
  /** blast-radius multiplier; defaults to 1 */
  weight?: number;
  /** if set, applying this finding ceilings the whole grade */
  cap?: CapHit;
}

const clamp = (n: number): number => Math.max(0, Math.min(100, n));
const round2 = (n: number): number => Math.round(n * 100) / 100;

export function gradeLetter(score: number): Letter {
  if (score >= 90) return "A";
  if (score >= 80) return "B";
  if (score >= 70) return "C";
  if (score >= 60) return "D";
  return "F";
}

/** Compute a full, explainable security grade from the available evidence. */
export function grade({ doctor, probe }: GradeInput): SecurityGrade {
  const riskByTool = new Map<string, RiskKind[]>();
  for (const r of assessRisks(doctor.tools ?? [])) {
    const arr = riskByTool.get(r.tool) ?? [];
    arr.push(r.risk);
    riskByTool.set(r.tool, arr);
  }

  const raws: Raw[] = [];
  for (const c of doctor.checks) raws.push(...checkRaws(c));
  if (probe) raws.push(...probeRaws(probe, riskByTool));

  // What evidence do we actually have?
  //  - conformance is always judged (we always try to connect),
  //  - interface/injection/confidentiality need tools to look at (a server that
  //    never returned a tool list can't be graded on its tools),
  //  - robustness/exploitation need an active probe that actually fired.
  const probed = probe != null && probe.probesRun > 0;
  const hasTools = (doctor.tools ?? []).length > 0;
  const isAssessed = (d: Dimension): boolean => {
    if (d === "robustness" || d === "exploitation") return probed;
    if (d === "interface" || d === "injection" || d === "confidentiality") return hasTools;
    return true; // conformance
  };

  const dimensions: DimensionScore[] = ORDER.map((d) => {
    const deductions: Deduction[] = raws
      .filter((r) => r.dimension === d)
      .map((r) => ({
        dimension: d,
        severity: r.severity,
        points: Math.round(BASE[r.severity] * (r.weight ?? 1)),
        tool: r.tool,
        detail: r.detail,
      }));
    const assessed = isAssessed(d);
    const lost = deductions.reduce((s, x) => s + x.points, 0);
    return {
      dimension: d,
      title: TITLE[d],
      assessed,
      score: assessed ? clamp(100 - lost) : 0,
      weight: DIM_WEIGHT[d],
      deductions,
    };
  });

  // Overall = weighted average over the ASSESSED dimensions (renormalised).
  const assessedDims = dimensions.filter((d) => d.assessed);
  const wsum = assessedDims.reduce((s, d) => s + d.weight, 0) || 1;
  let overall = assessedDims.reduce((s, d) => s + d.score * (d.weight / wsum), 0);

  // Caps: the lowest triggered ceiling wins.
  const caps: CapHit[] = [];
  const seen = new Set<string>();
  for (const r of raws) {
    if (r.cap && !seen.has(r.cap.reason)) {
      caps.push(r.cap);
      seen.add(r.cap.reason);
    }
  }
  for (const cap of caps) overall = Math.min(overall, cap.ceiling);

  const score = Math.round(clamp(overall));
  const seriousFinding = raws.some((r) => r.severity === "critical" || r.severity === "high");
  // A single badly-failing dimension blocks the badge even if the average is fine —
  // "Certified" should mean nothing is broken, not just that most things work.
  const dimFloorOk = assessedDims.every((d) => d.score >= CERT_DIM_FLOOR);

  return {
    target: doctor.target,
    rubric: RUBRIC_VERSION,
    score,
    grade: gradeLetter(score),
    certified: score >= CERT_THRESHOLD && caps.length === 0 && !seriousFinding && dimFloorOk,
    dimensions: dimensions.map((d) => ({ ...d, weight: d.assessed ? round2(d.weight / wsum) : 0 })),
    caps,
    assessed: { protocol: true, probe: probed },
  };
}

/** Map one doctor check into 0–2 raw deductions. Passing checks deduct nothing. */
function checkRaws(c: CheckResult): Raw[] {
  if (c.severity === "pass" || c.severity === "info") return [];
  switch (c.id) {
    case "transport_reachable":
    case "mcp_handshake":
      return [
        {
          dimension: "conformance",
          severity: "critical",
          detail: c.detail,
          cap: { dimension: "conformance", ceiling: CEIL_UNREACHABLE, reason: "server could not be reached or did not complete the MCP handshake" },
        },
      ];
    case "tools_list":
      return [{ dimension: "conformance", severity: "high", detail: c.detail }];
    case "manifest_valid":
    case "manifest_present":
      return [{ dimension: "conformance", severity: "low", detail: c.detail }];
    case "cors_headers":
      return [{ dimension: "interface", severity: "low", detail: c.detail }];
    case "tool_schemas":
      return [{ dimension: "interface", severity: "medium", detail: c.detail }];
    case "tool_descriptions":
      return [{ dimension: "interface", severity: "low", detail: c.detail }];
    case "security_lint": {
      // Aggregate check: may carry an injection pattern and/or a secret. The lint
      // detail tags each finding as "[injection]" or "[secret]".
      const out: Raw[] = [];
      const hasSecret = /\[secret\]/.test(c.detail);
      const hasInjection = /\[injection\]/.test(c.detail);
      if (hasInjection || !hasSecret) {
        out.push({
          dimension: "injection",
          severity: "high",
          detail: c.detail,
          cap: { dimension: "injection", ceiling: CEIL_INJECTION, reason: "a tool description carries a prompt-injection pattern (tool poisoning)" },
        });
      }
      if (hasSecret) {
        out.push({
          dimension: "confidentiality",
          severity: "high",
          detail: c.detail,
          cap: { dimension: "confidentiality", ceiling: CEIL_LEAK, reason: "a secret is embedded in a tool description" },
        });
      }
      return out;
    }
    default:
      return [];
  }
}

/** Map probe findings into raw deductions, weighted by each tool's blast radius. */
function probeRaws(report: ProbeReport, riskByTool: Map<string, RiskKind[]>): Raw[] {
  const raws: Raw[] = [];
  for (const f of report.findings) {
    const weight = capabilityWeight(f.tool, riskByTool);
    switch (f.vuln) {
      case "command-exec":
      case "path-traversal":
      case "ssrf":
        raws.push({
          dimension: "exploitation",
          severity: "critical",
          tool: f.tool,
          detail: f.detail,
          weight,
          cap: { dimension: "exploitation", ceiling: CEIL_EXPLOIT, reason: `confirmed ${f.vuln} on ${f.tool}` },
        });
        break;
      case "crash":
        raws.push({
          dimension: "robustness",
          severity: "critical",
          tool: f.tool,
          detail: f.detail,
          weight,
          cap: { dimension: "robustness", ceiling: CEIL_CRASH, reason: `${f.tool} crashed the server on adversarial input` },
        });
        break;
      case "leak":
        raws.push({
          dimension: "confidentiality",
          severity: "high",
          tool: f.tool,
          detail: f.detail,
          weight,
          cap: { dimension: "confidentiality", ceiling: CEIL_LEAK, reason: `${f.tool} leaked a secret in its output` },
        });
        break;
      case "output-schema":
        // the tool breaks its own declared output contract — an interface-quality bug
        raws.push({ dimension: "interface", severity: "medium", tool: f.tool, detail: f.detail, weight });
        break;
      case "weak-validation":
        raws.push({ dimension: "robustness", severity: "medium", tool: f.tool, detail: f.detail, weight });
        break;
      case "slow":
        raws.push({ dimension: "robustness", severity: "low", tool: f.tool, detail: f.detail, weight });
        break;
    }
  }
  return raws;
}

function capabilityWeight(tool: string, riskByTool: Map<string, RiskKind[]>): number {
  let w = 1;
  for (const k of riskByTool.get(tool) ?? []) w = Math.max(w, RISK_WEIGHT[k] ?? 1);
  return w;
}
