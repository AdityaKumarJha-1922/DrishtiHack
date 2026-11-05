import type { CaseRecord } from "./types";

// A blank case: everything unknown (null) until the interview and tests fill it.
export function createCase(opts: { case_id: string; shop_id: string; created_at?: string }): CaseRecord {
  return {
    case_id: opts.case_id,
    created_at: opts.created_at ?? new Date().toISOString(),
    shop_id: opts.shop_id,
    language: "hi",
    consent: { given: null, audio_url: null },
    person: { age: null, age_source: null, sex: null, occupation: null, reads: null },
    answers: [],
    tasks: { near: { hours: null, distance_cm: null }, intermediate: { hours: null }, distance: { hours: null } },
    symptoms: [],
    risks: { diabetes: null, tb_medicine: null, steroid_drops: null, eye_surgery: null, injury: null },
    danger_signs: [],
    tests: {
      distance_va: { right: null, left: null, pinhole: null, distance_m: null },
      clock_dial: null,
      near_point_cm: null,
      working_distance_cm: null,
      quality: { distance_ok: null, light_ok: null, eye_covered: null },
    },
    profile: { near: null, intermediate: null, distance: null },
    triage: { result: null, reasons: [] },
    suggestion: { type: null, power: null, try: [], explain: null, lenses: [] },
    review: null,
    follow_up: { day14_done: false, outcome: null },
  };
}
