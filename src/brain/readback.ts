// Read-back (Step 3): when a voice answer must be confirmed, and what to say.
// The wording is a fixed template from rules.yaml filled with the question's
// own option labels, so the read-back can never change the answer or its
// meaning. No LLM is involved, and it works offline.
import { RULES, type Question } from "./data";
import type { AnswerValue } from "./types";
import type { Understanding } from "./understanding";

/** True when this value contains a danger answer for this question. */
export function isDangerValue(q: Question, value: AnswerValue): boolean {
  if (!q.danger) return false;
  const chosen = (Array.isArray(value) ? value : [value]).map(String);
  return chosen.some((v) => q.danger!.includes(v));
}

/**
 * What to do with a gated voice answer:
 *  - "apply_now":  it is a danger answer; save it at once (the safer route; a
 *                  "Nahin" to a read-back must never be able to undo a danger sign)
 *  - "read_back":  a key answer, low confidence, or danger words heard
 *  - "preselect":  show it selected; the customer confirms with "Aage"
 *  - "taps":       unclear or rejected; the customer taps
 */
export function voiceAction(q: Question, u: Understanding): "apply_now" | "read_back" | "preselect" | "taps" {
  if (u.kind !== "answer") return "taps";
  if (isDangerValue(q, u.value)) return "apply_now";
  if (q.readback || u.needsReadback) return "read_back";
  return "preselect";
}

/** The read-back sentence, e.g. "Aapne kaha: 52 saal. Kya yeh sahi hai?" */
export function readbackText(q: Question, value: AnswerValue): string {
  let answer: string;
  if (q.type === "number") {
    answer = q.unit_hi ? `${value} ${q.unit_hi}` : String(value);
  } else if (q.type === "yes_no") {
    answer = value === "yes" ? "Haan" : "Nahin";
  } else {
    const chosen = Array.isArray(value) ? value : [value];
    answer = chosen
      .map((v) => q.options?.find((o) => o.value === v)?.label_hi ?? String(v))
      .join(", ");
  }
  return RULES.speech.readback_template_hi.replace("{answer}", answer);
}

/**
 * Reads a spoken yes/no locally: whole words from rules.yaml. Returns null
 * when it is unclear (no word, or both a yes and a no word, as in "theek nahin").
 */
export function parseYesNo(transcript: string): "yes" | "no" | null {
  const words = transcript.toLowerCase().split(/[\s,.!?।]+/).filter(Boolean);
  const yes = words.some((w) => RULES.speech.yes_words.includes(w));
  const no = words.some((w) => RULES.speech.no_words.includes(w));
  if (yes === no) return null;
  return yes ? "yes" : "no";
}
