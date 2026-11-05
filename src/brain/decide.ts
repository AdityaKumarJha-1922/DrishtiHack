// Triage, preliminary reading-glasses power, and lens suggestions.
// Every threshold comes from data/rules.yaml (draft, awaiting clinical approval).
// Nothing here is a prescription: the remote optometrist approves every case.
import { evaluate } from "./conditions";
import { RULES, type Rules } from "./data";
import type { CaseRecord, TriageResult } from "./types";

/** Index of a Snellen value in the line list (0 = best). Unknown values -> null. */
function lineIndex(rules: Rules, va: string | null): number | null {
  if (!va) return null;
  const i = rules.snellen_lines.indexOf(va);
  return i === -1 ? null : i;
}

/**
 * Green / Amber / Red with reasons, or result null while tests are missing.
 * Order of checks: danger signs, then distance vision, then Amber checks, then Green.
 */
export function triage(record: CaseRecord, rules: Rules = RULES): { result: TriageResult | null; reasons: string[] } {
  const t = rules.triage;

  // 1. Danger signs always win. Nothing below can soften them.
  if (record.danger_signs.length > 0) {
    return { result: "red", reasons: record.danger_signs.map((d) => `danger_sign:${d}`) };
  }

  const va = record.tests.distance_va;
  const right = lineIndex(rules, va.right);
  const left = lineIndex(rules, va.left);
  const limit = lineIndex(rules, t.reduced_worse_than)!;
  const amber: string[] = [];

  // 2. Reduced distance vision: the pinhole decides Amber (glasses may help) or Red.
  if (right !== null && left !== null) {
    const worst = Math.max(right, left);
    if (worst > limit) {
      const pin = lineIndex(rules, va.pinhole);
      if (pin === null) return { result: null, reasons: ["reduced_distance_vision", "pinhole_needed"] };
      if (worst - pin >= t.pinhole_improves_lines) amber.push("reduced_vision_improves_with_pinhole");
      else return { result: "red", reasons: ["reduced_vision_no_pinhole_improvement"] };
    }
    if (Math.abs(right - left) >= t.one_eye_worse_lines) amber.push("one_eye_clearly_worse");
  }

  // 3. Other Amber checks.
  if (record.tests.clock_dial === "uneven") amber.push("clock_dial_uneven");
  const age = record.person.age;
  const nearComplaint = record.symptoms.some((s) => t.near_complaints.includes(s));
  if (age !== null && age < t.near_complaint_full_test_under_age && nearComplaint) {
    amber.push("under_40_with_near_complaint");
  }
  if (amber.length > 0) return { result: "amber", reasons: amber };

  // 4. Green needs every check known and fine.
  const missing: string[] = [];
  if (age === null) missing.push("age_missing");
  if (right === null || left === null) missing.push("distance_vision_not_tested");
  if (record.tests.clock_dial === null) missing.push("clock_dial_not_tested");
  if (missing.length > 0) return { result: null, reasons: missing };
  if (age! < t.green_min_age) return { result: null, reasons: ["under_green_min_age_no_complaint"] };

  const reasons = ["age_40_plus", "distance_vision_ok", "clock_dial_even", "no_danger_signs"];
  if (record.risks.diabetes === true) reasons.push(rules.messages.retina_check_reason);
  return { result: "green", reasons };
}

/**
 * Preliminary reading add from the Build spec formula:
 *   add = 100 / work_cm - share * (100 / near_point_cm), rounded.
 * Returns null when a distance is missing or the result is not positive.
 */
export function readingAdd(workCm: number | null, nearPointCm: number | null, rules: Rules = RULES): number | null {
  if (!workCm || !nearPointCm || workCm <= 0 || nearPointCm <= 0) return null;
  const rp = rules.reading_power;
  const raw = 100 / workCm - rp.reserve_share * (100 / nearPointCm);
  const rounded = Math.round(raw / rp.round_to) * rp.round_to;
  return rounded > 0 ? rounded : null;
}

/** Fills triage and suggestion on a copy of the record. */
export function decide(record: CaseRecord, rules: Rules = RULES): CaseRecord {
  const out = structuredClone(record);
  out.triage = triage(out, rules);

  const result = out.triage.result;
  const s = out.suggestion;
  s.type = result === "red" ? "doctor" : result === "amber" ? "full_test" : result === "green" ? "readers" : null;
  s.power = null;
  s.try = [];
  if (result === "green") {
    const add = readingAdd(out.tests.working_distance_cm, out.tests.near_point_cm, rules);
    if (add !== null) {
      const step = rules.reading_power.trial_step;
      s.power = add;
      s.try = [add - step, add, add + step].filter((p) => p > 0);
    }
  }
  // Customer-facing explanation waits for approved Hindi wording.
  s.explain = null;
  s.lenses = result === "red" ? [] : rules.lens_suggestions.filter((l) => evaluate(l.when, out) === true).map((l) => l.code);
  return out;
}
