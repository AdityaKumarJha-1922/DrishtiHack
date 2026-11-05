// Read-back (Step 3): when a voice answer must be confirmed, and what to say.
// The wording is a fixed template (customer_text.yaml) filled with the
// question's own option labels, in either script, so the read-back can never
// change the answer or its meaning. No LLM is involved, and it works offline.
import { RULES, type Question } from "./data";
import { optionLabel, t, type Script } from "./text";
import type { AnswerValue } from "./types";
import type { Understanding } from "./understanding";
import { normalizeText } from "./words";

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

/** The read-back sentence, e.g. "Aapne kaha: 52 saal. Kya yeh sahi hai?" or "आपने कहा: 52 साल। क्या यह सही है?" */
export function readbackText(q: Question, value: AnswerValue, script: Script): string {
  let answer: string;
  if (q.type === "number") {
    const unit = script === "deva" ? q.unit_deva ?? q.unit_hi : q.unit_hi;
    answer = unit ? `${value} ${unit}` : String(value);
  } else if (q.type === "yes_no") {
    answer = t(value === "yes" ? "yes" : "no", script);
  } else {
    const chosen = Array.isArray(value) ? value : [value];
    answer = chosen
      .map((v) => {
        const o = q.options?.find((x) => x.value === v);
        return o ? optionLabel(o, script) : String(v);
      })
      .join(", ");
  }
  return t("readback_template", script, { answer });
}

/**
 * Reads a spoken yes/no locally: whole words from rules.yaml. Returns null
 * when it is unclear (no word, or both a yes and a no word, as in "theek nahin").
 */
export function parseYesNo(transcript: string): "yes" | "no" | null {
  const words = normalizeText(transcript).split(/[\s,.!?।]+/).filter(Boolean);
  const yes = words.some((w) => RULES.speech.yes_words.map(normalizeText).includes(w));
  const no = words.some((w) => RULES.speech.no_words.map(normalizeText).includes(w));
  if (yes === no) return null;
  return yes ? "yes" : "no";
}
