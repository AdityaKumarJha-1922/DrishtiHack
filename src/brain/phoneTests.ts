// M2 phone tests: the procedures and the maths, all deterministic.
// These SCREEN and ESTIMATE; they are not an eye examination. Results go into
// record.tests and are read by triage() / decide(); nothing here decides Green,
// Amber or Red itself. Settings come from rules.yaml (phone_tests), where the
// procedure details are marked as proposals awaiting clinical approval.
import { evaluate } from "./conditions";
import { RULES, type Rules } from "./data";
import { isStopped, type ApplyResult } from "./interview";
import type { CaseRecord } from "./types";
import { normalizeText } from "./words";

export type Direction = "up" | "down" | "left" | "right";
export const DIRECTIONS: Direction[] = ["up", "down", "left", "right"];

// ---------- letter size ----------

/** Height in mm of a tumbling E for a Snellen line ("6/x") seen from `distanceM` metres. */
export function optotypeHeightMm(snellen: string, distanceM: number, rules: Rules = RULES): number {
  const m = /^6\/(\d+)$/.exec(snellen);
  if (!m) throw new Error(`not a Snellen line: ${snellen}`);
  const arcmin = rules.phone_tests.distance_chart.optotype_arcmin_at_6_6 * (Number(m[1]) / 6);
  return distanceM * 1000 * Math.tan((arcmin / 60) * (Math.PI / 180));
}

// ---------- the distance chart (one eye) ----------

export interface ChartState {
  lineIndex: number; // index into snellen_lines of the line being shown
  shown: number; // letters shown on this line so far
  correct: number;
  lastPassed: number | null; // smallest line read so far
  current: Direction; // which way the E being shown points
  done: boolean;
}

/** `pick` chooses a direction; the app passes a random one, tests pass a fixed one. */
export type Pick = () => Direction;
export const randomPick: Pick = () => DIRECTIONS[Math.floor(Math.random() * 4)];

export function startChart(pick: Pick = randomPick, rules: Rules = RULES): ChartState {
  const start = rules.snellen_lines.indexOf(rules.phone_tests.distance_chart.start_line);
  return { lineIndex: start, shown: 0, correct: 0, lastPassed: null, current: pick(), done: false };
}

/**
 * Records the customer's answer for the E on screen ("cant_see" counts as wrong).
 * A line is read when `pass_correct` letters are right; it stops early once
 * the pass mark is reached or can no longer be reached.
 */
export function answerChart(s: ChartState, answer: Direction | "cant_see", pick: Pick = randomPick, rules: Rules = RULES): ChartState {
  if (s.done) return s;
  const { letters_per_line: n, pass_correct: need } = rules.phone_tests.distance_chart;
  const shown = s.shown + 1;
  const correct = s.correct + (answer === s.current ? 1 : 0);
  const passed = correct >= need;
  const failed = shown - correct > n - need;
  if (!passed && !failed) return { ...s, shown, correct, current: pick() };
  if (failed) return { ...s, shown, correct, done: true };
  // Passed this line: go to the next smaller line, or stop at the smallest.
  if (s.lineIndex === 0) return { ...s, shown, correct, lastPassed: 0, done: true };
  return { lineIndex: s.lineIndex - 1, shown: 0, correct: 0, lastPassed: s.lineIndex, current: pick(), done: false };
}

/** The Snellen result of a finished chart: the smallest line read, or "<6/60". */
export function chartResult(s: ChartState, rules: Rules = RULES): string {
  const lines = rules.snellen_lines;
  return s.lastPassed === null ? lines[lines.length - 1] : lines[s.lastPassed];
}

/** A spoken direction ("upar", "daayen", "नीचे"...), matched locally. Null when unclear. */
export function parseDirection(transcript: string, rules: Rules = RULES): Direction | null {
  const words = normalizeText(transcript).split(/[\s,.!?।]+/).filter(Boolean);
  const hits = DIRECTIONS.filter((d) => words.some((w) => rules.phone_tests.direction_words[d].map(normalizeText).includes(w)));
  return hits.length === 1 ? hits[0] : null;
}

// ---------- distance from the camera (iris as a ruler) ----------

export interface Point { x: number; y: number } // MediaPipe landmarks: 0..1 of the frame

/** Iris diameter in pixels, averaged over both eyes (MediaPipe iris landmarks 469/471 and 474/476). */
export function irisDiameterPx(landmarks: Point[], frameW: number, frameH: number): number | null {
  const d = (a: number, b: number) => {
    const p = landmarks.at(a), q = landmarks.at(b);
    if (!p || !q) return null;
    return Math.hypot((p.x - q.x) * frameW, (p.y - q.y) * frameH);
  };
  const one = d(469, 471), two = d(474, 476);
  if (one === null || two === null || one <= 0 || two <= 0) return null;
  return (one + two) / 2;
}

/** From the once-per-phone calibration: focal length as a fraction of frame width. */
export function focalRatio(irisPx: number, frameW: number, rules: Rules = RULES): number {
  const c = rules.phone_tests.camera;
  return (irisPx * c.calibration_distance_cm * 10) / c.iris_diameter_mm / frameW;
}

/** Camera-to-eye distance in cm. */
export function distanceCm(irisPx: number, frameW: number, ratio: number, rules: Rules = RULES): number {
  return (ratio * frameW * rules.phone_tests.camera.iris_diameter_mm) / irisPx / 10;
}

/** The median of several readings; null if too few or outside the reliable range. */
export function steadyReading(cms: number[], rules: Rules = RULES): number | null {
  const c = rules.phone_tests.camera;
  if (cms.length < c.samples) return null;
  const sorted = [...cms].sort((a, b) => a - b);
  const mid = sorted[Math.floor(sorted.length / 2)];
  if (mid < c.min_cm || mid > c.max_cm) return null;
  return Math.round(mid);
}

// ---------- which tests a case needs ----------

function worstLine(record: CaseRecord, rules: Rules): number | null {
  const { right, left } = record.tests.distance_va;
  const r = right ? rules.snellen_lines.indexOf(right) : -1;
  const l = left ? rules.snellen_lines.indexOf(left) : -1;
  return r < 0 || l < 0 ? null : Math.max(r, l);
}

/** The pinhole step runs when the worse eye is worse than the triage limit. */
export function pinholeNeeded(record: CaseRecord, rules: Rules = RULES): boolean {
  const worst = worstLine(record, rules);
  return worst !== null && worst > rules.snellen_lines.indexOf(rules.triage.reduced_worse_than);
}

/** Which eye the pinhole re-tests (the worse one; right when equal). */
export function pinholeEye(record: CaseRecord, rules: Rules = RULES): "right" | "left" {
  const { right, left } = record.tests.distance_va;
  return rules.snellen_lines.indexOf(left ?? "") > rules.snellen_lines.indexOf(right ?? "") ? "left" : "right";
}

export function nearTestsNeeded(record: CaseRecord, rules: Rules = RULES): boolean {
  return evaluate(rules.phone_tests.near.run_if, record) !== false;
}

export type TestStep = "distance_right" | "distance_left" | "pinhole" | "clock_dial" | "near_point" | "working_distance";

/** The next test this case still needs, or null when the tests are complete. */
export function nextTest(record: CaseRecord, rules: Rules = RULES): TestStep | null {
  if (isStopped(record)) return null;
  const t = record.tests;
  if (!t.distance_va.right) return "distance_right";
  if (!t.distance_va.left) return "distance_left";
  if (pinholeNeeded(record, rules) && !t.distance_va.pinhole) return "pinhole";
  if (!t.clock_dial) return "clock_dial";
  if (nearTestsNeeded(record, rules)) {
    if (t.near_point_cm === null) return "near_point";
    if (t.working_distance_cm === null) return "working_distance";
  }
  return null;
}

// ---------- writing results (validated, never on a stopped case) ----------

type TestValue =
  | { step: "distance_right" | "distance_left" | "pinhole"; snellen: string }
  | { step: "clock_dial"; even: boolean }
  | { step: "near_point" | "working_distance"; cm: number };

/** Records one test result. Refused on a Red case, out of order, or with a bad value. */
export function applyTestResult(record: CaseRecord, v: TestValue, quality: Partial<CaseRecord["tests"]["quality"]> = {}, rules: Rules = RULES): ApplyResult {
  if (isStopped(record)) return { ok: false, error: "case is Red: tests stopped" };
  const expected = nextTest(record, rules);
  if (expected !== v.step) return { ok: false, error: `expected ${expected ?? "no more tests"}` };
  const next = structuredClone(record);
  const t = next.tests;
  if ("snellen" in v) {
    if (!rules.snellen_lines.includes(v.snellen)) return { ok: false, error: "not a chart line" };
    if (v.step === "distance_right") t.distance_va.right = v.snellen;
    else if (v.step === "distance_left") t.distance_va.left = v.snellen;
    else t.distance_va.pinhole = v.snellen;
    t.distance_va.distance_m = rules.phone_tests.distance_chart.distance_m;
  } else if ("even" in v) {
    t.clock_dial = v.even ? "even" : "uneven";
  } else {
    const c = rules.phone_tests.camera;
    if (!Number.isFinite(v.cm) || v.cm < c.min_cm || v.cm > c.max_cm) return { ok: false, error: `distance must be ${c.min_cm}-${c.max_cm} cm` };
    if (v.step === "near_point") t.near_point_cm = Math.round(v.cm);
    else t.working_distance_cm = Math.round(v.cm);
  }
  // Quality flags only ever record what the helper confirmed; a false stays false.
  for (const [k, val] of Object.entries(quality) as [keyof typeof t.quality, boolean | null][]) {
    if (val === false) t.quality[k] = false;
    else if (t.quality[k] === null) t.quality[k] = val;
  }
  return { ok: true, record: next };
}
