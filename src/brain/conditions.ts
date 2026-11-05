// Evaluates the small condition language used by ask_if (questions.yaml) and
// lens_suggestions (rules.yaml).
//
// Results are three-valued: true, false, or "unknown" (a field we don't have yet).
// An unknown condition is treated as "maybe": the question is still asked,
// and progress counts it as possibly coming.
import type { CaseRecord } from "./types";

export type Condition =
  | { field: string; op: "==" | ">=" | "<" | "in" | "includes"; value: unknown }
  | { all: Condition[] }
  | { any: Condition[] };

export type Tri = true | false | "unknown";

// "person.age" -> record.person.age; "answer.driving" -> value of that answer.
export function readField(record: CaseRecord, field: string): unknown {
  if (field.startsWith("answer.")) {
    const id = field.slice("answer.".length);
    return record.answers.find((a) => a.q === id)?.value;
  }
  let current: unknown = record;
  for (const key of field.split(".")) {
    if (current === null || typeof current !== "object") return undefined;
    current = (current as Record<string, unknown>)[key];
  }
  return current;
}

export function evaluate(cond: Condition, record: CaseRecord): Tri {
  if ("all" in cond) {
    const results = cond.all.map((c) => evaluate(c, record));
    if (results.includes(false)) return false;
    return results.includes("unknown") ? "unknown" : true;
  }
  if ("any" in cond) {
    const results = cond.any.map((c) => evaluate(c, record));
    if (results.includes(true)) return true;
    return results.includes("unknown") ? "unknown" : false;
  }

  const actual = readField(record, cond.field);
  if (actual === null || actual === undefined) return "unknown";

  switch (cond.op) {
    case "==":
      return actual === cond.value;
    case ">=":
      return typeof actual === "number" && actual >= (cond.value as number);
    case "<":
      return typeof actual === "number" && actual < (cond.value as number);
    case "in":
      return Array.isArray(cond.value) && cond.value.includes(actual);
    case "includes":
      return Array.isArray(actual) && actual.includes(cond.value);
  }
}
