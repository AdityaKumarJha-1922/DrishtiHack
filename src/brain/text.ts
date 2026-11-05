// Customer wording in two scripts: data/customer_text.yaml for prompts and
// messages, questions.yaml for question wording and option labels.
import { parse } from "yaml";
import customerYaml from "../../data/customer_text.yaml?raw";
import type { Option, Question } from "./data";

export type Script = "latn" | "deva"; // Roman Hindi | Devanagari

interface Entry { latn: string; deva: string; status: "draft" | "approved" }
interface CustomerText { default_script: Script; speak_script: Script; texts: Record<string, Entry> }

export const CUSTOMER_TEXT: CustomerText = parse(customerYaml);
export const DEFAULT_SCRIPT: Script = CUSTOMER_TEXT.default_script;
/** Spoken text always uses this script: Hindi voices read Devanagari correctly, Roman Hindi poorly. */
export const SPEAK_SCRIPT: Script = CUSTOMER_TEXT.speak_script;

/**
 * A customer text in the chosen script with {placeholders} filled, e.g.
 * t("progress_question", "deva", { n: 3 }) -> "सवाल 3". A missing key shows as
 * "[missing: key]" so it is visible on screen (tests/data.test.ts guards this).
 */
export function t(key: string, script: Script, vars: Record<string, string | number> = {}): string {
  const entry = CUSTOMER_TEXT.texts[key];
  if (!entry) return `[missing: ${key}]`;
  let text = entry[script];
  for (const [k, v] of Object.entries(vars)) text = text.split(`{${k}}`).join(String(v));
  return text;
}

/** True only after the clinical lead set `status: approved` for this text. */
export function isApproved(key: string): boolean {
  return CUSTOMER_TEXT.texts[key]?.status === "approved";
}

export function questionText(q: Question, script: Script): string {
  return script === "deva" && q.text_deva ? q.text_deva : q.text_hi;
}

export function optionLabel(o: Option, script: Script): string {
  return script === "deva" && o.label_deva ? o.label_deva : o.label_hi;
}
