// Checks that a saved case has EXACTLY the canonical shape of
// src/brain/types.ts (CaseRecord): no missing keys, no extra keys, right types.
// Plain TypeScript with no imports, so the Edge Functions (Deno) and the app
// tests (Vitest) share one copy. Keep it in step with types.ts; the test
// tests/case_shape.test.ts fails if a blank case stops matching.

type Rule =
  | "string" | "string?" | "number?" | "boolean" | "boolean?" | "any"
  | "string[]" | "number[]" | { enum: (string | null)[] } | { object: Shape; nullable?: boolean }
  | { array: Shape };
type Shape = { [key: string]: Rule };

const ANSWER: Shape = {
  q: "string", transcript: "string?", value: "any", confidence: "number?", confirmed: "boolean", audio_url: "string?",
};

export const CASE_SHAPE: Shape = {
  case_id: "string",
  created_at: "string",
  shop_id: "string",
  language: "string",
  consent: { object: { given: "boolean?", audio_url: "string?" } },
  person: { object: {
    age: "number?", age_source: { enum: ["stated", "aadhaar", null] }, sex: "string?", occupation: "string?", reads: "string?",
  } },
  answers: { array: ANSWER },
  tasks: { object: {
    near: { object: { hours: "number?", distance_cm: "number?" } },
    intermediate: { object: { hours: "number?" } },
    distance: { object: { hours: "number?" } },
  } },
  symptoms: "string[]",
  risks: { object: {
    diabetes: "boolean?", tb_medicine: "boolean?", steroid_drops: "boolean?", eye_surgery: "boolean?", injury: "boolean?",
  } },
  danger_signs: "string[]",
  tests: { object: {
    distance_va: { object: { right: "string?", left: "string?", pinhole: "string?", distance_m: "number?" } },
    clock_dial: { enum: ["even", "uneven", null] },
    near_point_cm: "number?",
    working_distance_cm: "number?",
    quality: { object: { distance_ok: "boolean?", light_ok: "boolean?", eye_covered: "boolean?" } },
  } },
  profile: { object: { near: "number?", intermediate: "number?", distance: "number?" } },
  triage: { object: { result: { enum: ["green", "amber", "red", null] }, reasons: "string[]" } },
  suggestion: { object: {
    type: { enum: ["readers", "full_test", "doctor", null] }, power: "number?", try: "number[]", explain: "string?", lenses: "string[]",
  } },
  review: { nullable: true, object: {
    optometrist_id: "string?", decision: { enum: ["approved", "edited", "rejected", null] }, edits: "any", seconds: "number?",
    reply_audio_url: "string?",
  } },
  follow_up: { object: { day14_done: "boolean", outcome: "string?" } },
};

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

function check(value: unknown, rule: Rule, path: string, errors: string[]): void {
  const bad = (what: string): void => { errors.push(`${path}: ${what}`); };
  if (typeof rule === "string") {
    const nullable = rule.endsWith("?");
    if (nullable && value === null) return;
    switch (rule.replace("?", "")) {
      case "string": if (typeof value !== "string") bad("expected string"); return;
      case "number": if (typeof value !== "number" || !Number.isFinite(value)) bad("expected number"); return;
      case "boolean": if (typeof value !== "boolean") bad("expected boolean"); return;
      case "string[]": if (!Array.isArray(value) || value.some((x) => typeof x !== "string")) bad("expected string[]"); return;
      case "number[]": if (!Array.isArray(value) || value.some((x) => typeof x !== "number")) bad("expected number[]"); return;
      case "any": if (value === undefined) bad("missing"); return;
    }
    return;
  }
  if ("enum" in rule) { if (!rule.enum.includes(value as string | null)) bad(`not one of ${rule.enum.join("|")}`); return; }
  if ("array" in rule) {
    if (!Array.isArray(value)) return bad("expected array");
    value.forEach((item, i) => check(item, { object: rule.array }, `${path}[${i}]`, errors));
    return;
  }
  if (rule.nullable && value === null) return;
  if (!isObj(value)) return bad("expected object");
  for (const key of Object.keys(rule.object)) {
    if (!(key in value)) bad(`missing ${key}`);
    else check(value[key], rule.object[key], path ? `${path}.${key}` : key, errors);
  }
  for (const key of Object.keys(value)) if (!(key in rule.object)) bad(`unexpected field ${key}`);
}

/** Returns the list of problems; empty means the record has the canonical shape. */
export function caseShapeErrors(record: unknown): string[] {
  const errors: string[] = [];
  check(record, { object: CASE_SHAPE }, "", errors);
  return errors;
}

/**
 * Rules for overwriting a stored case (saves are retried and repeated):
 *  - a save may never drop a danger sign that is already stored;
 *  - a case the optometrist has reviewed cannot be changed from the shop.
 * Returns an error code, or null when the save is allowed.
 */
export function resaveError(stored: unknown, incoming: Record<string, unknown>): string | null {
  if (incoming.review !== null) return "review_set_by_shop"; // only the optometrist portal reviews
  if (!isObj(stored)) return null; // first save
  const storedDanger = Array.isArray(stored.danger_signs) ? stored.danger_signs : [];
  const newDanger = Array.isArray(incoming.danger_signs) ? incoming.danger_signs : [];
  if (storedDanger.some((d) => !newDanger.includes(d))) return "danger_sign_removed";
  if (stored.review !== null && stored.review !== undefined) return "already_reviewed";
  if (stored.shop_id !== incoming.shop_id) return "shop_mismatch";
  return null;
}
