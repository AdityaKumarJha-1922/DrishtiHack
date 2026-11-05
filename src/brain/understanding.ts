// The gate between the language model and the interview.
//
// The model only turns a spoken transcript into a candidate answer for the
// CURRENT question. This file:
//   1. builds the JSON schema the model must follow, from questions.yaml, and
//   2. treats whatever comes back as untrusted input: it must name the current
//      question and its fills path, use only that question's allowed values,
//      and carry a confidence between 0 and 1. Anything else is rejected and
//      the customer answers by tap instead.
// A voice answer is only ever a pre-selection; applyAnswer() still checks it.
import { RULES, type Question } from "./data";
import { validateAnswer } from "./interview";
import type { AnswerValue } from "./types";
import { matchSymptoms } from "./words";

export interface ModelReply {
  question_id: string;
  path: string;
  unclear: boolean;
  value: AnswerValue | null;
  confidence: number; // 0..1, the model's own confidence in `value`
}

export type Understanding =
  | {
      kind: "answer";
      value: AnswerValue;
      confidence: number;
      // True when the answer must be read back or confirmed by tap (Step 3).
      needsReadback: boolean;
      // Danger words heard in the transcript, for the shopkeeper's attention.
      dangerWordsHeard: string[];
    }
  | { kind: "unclear"; confidence: number; dangerWordsHeard: string[] }
  | { kind: "rejected"; reason: string; dangerWordsHeard: string[] };

const REPLY_KEYS = ["question_id", "path", "unclear", "value", "confidence"];

/** The JSON schema for the model's reply to this question. */
export function replySchema(q: Question): Record<string, unknown> {
  const values = (q.options ?? []).map((o) => o.value);
  const optionSchema = values.every((v) => typeof v === "number")
    ? { type: "integer", enum: values }
    : { type: "string", enum: values.map(String) };

  let valueSchema: Record<string, unknown>;
  if (q.type === "yes_no") valueSchema = { type: "string", enum: ["yes", "no"] };
  else if (q.type === "choice") valueSchema = optionSchema;
  else if (q.type === "multi") valueSchema = { type: "array", items: optionSchema };
  else valueSchema = { type: "integer" }; // range is checked in parseReply, not by the schema

  return {
    type: "object",
    additionalProperties: false,
    required: REPLY_KEYS,
    properties: {
      question_id: { type: "string", enum: [q.id] },
      path: { type: "string", enum: [q.fills.path] },
      unclear: { type: "boolean" },
      value: { anyOf: [valueSchema, { type: "null" }] },
      confidence: { type: "number" },
    },
  };
}

/** What the understand function needs to know about the question (no rules, no danger lists). */
export function questionForModel(q: Question) {
  return {
    id: q.id,
    text_hi: q.text_hi,
    type: q.type,
    path: q.fills.path,
    options: (q.options ?? []).map((o) => ({ value: o.value, label_hi: o.label_hi })),
    min: q.min ?? null,
    max: q.max ?? null,
  };
}

/** Danger phrases (from symptom_words.csv) found in the transcript. */
export function dangerWordsIn(transcript: string): string[] {
  return [...new Set(matchSymptoms(transcript).filter((w) => w.danger).map((w) => w.meaning))];
}

/** Checks an untrusted model reply against the current question. */
export function parseReply(raw: unknown, q: Question, transcript: string): Understanding {
  const dangerWordsHeard = dangerWordsIn(transcript);
  const reject = (reason: string): Understanding => ({ kind: "rejected", reason, dangerWordsHeard });

  let reply: unknown = raw;
  if (typeof raw === "string") {
    try {
      reply = JSON.parse(raw);
    } catch {
      return reject("malformed_json");
    }
  }
  if (!reply || typeof reply !== "object" || Array.isArray(reply)) return reject("not_an_object");
  const r = reply as Record<string, unknown>;

  const keys = Object.keys(r).sort();
  if (keys.join() !== [...REPLY_KEYS].sort().join()) return reject("unexpected_or_missing_fields");
  if (r.question_id !== q.id) return reject("wrong_question");
  if (r.path !== q.fills.path) return reject("wrong_path");
  if (typeof r.unclear !== "boolean") return reject("bad_unclear_flag");
  if (typeof r.confidence !== "number" || !Number.isFinite(r.confidence) || r.confidence < 0 || r.confidence > 1) {
    return reject("bad_confidence");
  }
  const confidence = r.confidence;

  if (r.unclear) {
    if (r.value !== null) return reject("conflicting_unclear_and_value");
    return { kind: "unclear", confidence, dangerWordsHeard };
  }
  if (r.value === null) return reject("conflicting_unclear_and_value");

  const value = r.value as AnswerValue;
  const problem = validateAnswer(q, value);
  if (problem) return reject(`invalid_value: ${problem}`);

  // Safer route: danger words were heard, but the model says "no danger".
  if (q.danger && dangerWordsHeard.length > 0) {
    const chosen = (Array.isArray(value) ? value : [value]).map(String);
    if (!chosen.some((v) => q.danger!.includes(v))) return reject("conflicts_with_danger_words_heard");
  }

  const needsReadback = confidence < RULES.speech.readback_below_confidence || dangerWordsHeard.length > 0;
  return { kind: "answer", value, confidence, needsReadback, dangerWordsHeard };
}
