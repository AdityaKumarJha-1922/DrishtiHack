// The canonical case record. This file is the single source of truth for the
// case shape; it mirrors the JSON in docs/Build_spec.md ("The case record").
// Change both together.
//
// `null` means "not known yet" (for example, tests that happen in M2).

export type TriageResult = "green" | "amber" | "red";
export type AnswerValue = string | number | boolean | string[];

export interface Answer {
  q: string; // question id from data/questions.yaml
  transcript: string | null; // null for a tap answer
  value: AnswerValue;
  confidence: number | null; // 0..1 from speech understanding; null for a tap answer
  confirmed: boolean; // a tap answer counts as confirmed
  audio_url: string | null;
}

export interface CaseRecord {
  case_id: string;
  created_at: string; // ISO time with offset
  shop_id: string;
  language: string; // "hi"
  consent: { given: boolean | null; audio_url: string | null };
  person: {
    age: number | null;
    age_source: "stated" | "aadhaar" | null;
    sex: string | null;
    occupation: string | null;
    reads: string | null;
  };
  answers: Answer[];
  tasks: {
    near: { hours: number | null; distance_cm: number | null };
    intermediate: { hours: number | null };
    distance: { hours: number | null };
  };
  symptoms: string[];
  risks: {
    diabetes: boolean | null;
    tb_medicine: boolean | null;
    steroid_drops: boolean | null;
    eye_surgery: boolean | null;
    injury: boolean | null;
  };
  danger_signs: string[];
  tests: {
    distance_va: {
      right: string | null; // Snellen, e.g. "6/9"
      left: string | null;
      pinhole: string | null; // best pinhole result, when the pinhole step ran
      distance_m: number | null;
    };
    clock_dial: "even" | "uneven" | null;
    near_point_cm: number | null;
    working_distance_cm: number | null;
    quality: { distance_ok: boolean | null; light_ok: boolean | null; eye_covered: boolean | null };
  };
  profile: { near: number | null; intermediate: number | null; distance: number | null };
  triage: { result: TriageResult | null; reasons: string[] };
  suggestion: {
    type: "readers" | "full_test" | "doctor" | null;
    power: number | null; // PRELIMINARY reading add, never a prescription
    try: number[];
    explain: string | null;
    // Lens suggestion codes from data/rules.yaml (added in v0.1; see Build_spec).
    lenses: string[];
  };
  review: {
    optometrist_id: string | null;
    decision: "approved" | "edited" | "rejected" | null;
    edits: unknown;
    seconds: number | null;
    reply_audio_url: string | null;
  } | null;
  follow_up: { day14_done: boolean; outcome: string | null };
}
