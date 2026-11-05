// The adaptive interview. Every decision here comes from data/questions.yaml:
// which question is next, what counts as a valid answer, where it is stored,
// and which answers are danger signs.
//
// Functions never change the record they are given; they return a new one.
// (Python comparison: like returning a deep copy instead of mutating a dict.)
import { evaluate } from "./conditions";
import { createCase } from "./caseRecord";
import { QUESTIONS, getQuestion, type Question } from "./data";
import type { AnswerValue, CaseRecord } from "./types";

export type ApplyResult = { ok: true; record: CaseRecord } | { ok: false; error: string };

export interface AnswerMeta {
  transcript?: string | null;
  confidence?: number | null;
  confirmed?: boolean;
  audio_url?: string | null;
}

/** True once any danger sign is recorded. The interview stops for good. */
export function isStopped(record: CaseRecord): boolean {
  return record.danger_signs.length > 0;
}

function isAnswered(record: CaseRecord, id: string): boolean {
  return record.answers.some((a) => a.q === id);
}

/** The next question to ask, or null when the interview is over (finished or stopped). */
export function nextQuestion(record: CaseRecord): Question | null {
  if (isStopped(record)) return null;
  for (const q of QUESTIONS) {
    if (isAnswered(record, q.id)) continue;
    // Unknown counts as "ask": when in doubt we ask rather than skip.
    if (q.ask_if && evaluate(q.ask_if, record) === false) continue;
    return q;
  }
  return null;
}

/**
 * Truthful progress for an adaptive interview: how many answered, and the
 * most questions that could still come (skips can only make it shorter).
 */
export function progress(record: CaseRecord): { answered: number; atMost: number } {
  const answered = record.answers.length;
  if (isStopped(record)) return { answered, atMost: answered };
  const stillPossible = QUESTIONS.filter(
    (q) => !isAnswered(record, q.id) && (!q.ask_if || evaluate(q.ask_if, record) !== false),
  ).length;
  return { answered, atMost: answered + stillPossible };
}

/** Checks a value against the question's own rules. Returns an error message or null. */
export function validateAnswer(q: Question, value: AnswerValue): string | null {
  const optionValues = (q.options ?? []).map((o) => o.value);
  switch (q.type) {
    case "yes_no":
      return value === "yes" || value === "no" ? null : "expected yes or no";
    case "choice":
      return optionValues.includes(value as string | number) ? null : "not one of the options";
    case "multi": {
      if (!Array.isArray(value) || value.length === 0) return "choose at least one option";
      if (new Set(value).size !== value.length) return "an option was chosen twice";
      if (value.some((v) => !optionValues.includes(v))) return "not one of the options";
      if (q.none_value && value.includes(q.none_value) && value.length > 1) {
        return "'none' cannot be combined with other options";
      }
      return null;
    }
    case "number":
      if (typeof value !== "number" || !Number.isInteger(value)) return "expected a whole number";
      if (q.min !== undefined && value < q.min) return `must be at least ${q.min}`;
      if (q.max !== undefined && value > q.max) return `must be at most ${q.max}`;
      return null;
  }
}

/** Writes an answer into the case fields named by the question's `fills`. */
function applyFill(record: CaseRecord, q: Question, value: AnswerValue): void {
  const { path, mode } = q.fills;
  const selected = Array.isArray(value) ? value : [value];
  const notNone = selected.filter((v) => v !== q.none_value).map(String);

  if (path === "answers_only") return;
  if (path === "consent.given") record.consent.given = value === "yes";
  else if (path === "person.age") {
    record.person.age = value as number;
    record.person.age_source = "stated";
  } else if (path === "person.occupation") record.person.occupation = value as string;
  else if (path === "tasks.near.hours" && mode === "add") {
    record.tasks.near.hours = (record.tasks.near.hours ?? 0) + (value as number);
  } else if (path === "symptoms" && mode === "add_all") {
    for (const s of notNone) if (!record.symptoms.includes(s)) record.symptoms.push(s);
  } else if (path === "symptoms" && mode === "add_if_no") {
    if (value === "no" && q.fills.value && !record.symptoms.includes(q.fills.value)) {
      record.symptoms.push(q.fills.value);
    }
  } else if (path === "risks" && mode === "set_flags") {
    // Every listed option becomes a known true/false flag.
    for (const opt of q.options ?? []) {
      const key = String(opt.value);
      if (key === q.none_value) continue;
      if (key in record.risks) {
        (record.risks as Record<string, boolean | null>)[key] = notNone.includes(key);
      }
    }
  } else {
    // A data file named a target the code doesn't know: fail loudly, never guess.
    throw new Error(`questions.yaml: unknown fill ${path}/${mode ?? ""} on ${q.id}`);
  }
}

/** Records any danger signs in the answer. Once recorded, the case is Red and stopped. */
function applyDanger(record: CaseRecord, q: Question, value: AnswerValue): void {
  if (!q.danger) return;
  const selected = (Array.isArray(value) ? value : [value]).map(String);
  const hits = selected.filter((v) => q.danger!.includes(v));
  if (hits.length === 0) return;
  // For multi questions the value itself is the code; yes/no questions name one.
  const codes = q.type === "multi" ? hits : [q.danger_code ?? q.id];
  for (const c of codes) if (!record.danger_signs.includes(c)) record.danger_signs.push(c);
  record.triage = { result: "red", reasons: record.danger_signs.map((d) => `danger_sign:${d}`) };
}

/**
 * Applies the answer to the current question. Refuses (ok: false) when the
 * interview is stopped, the question is not the current one, or the value is
 * invalid; the record is then unchanged.
 */
export function applyAnswer(
  record: CaseRecord,
  questionId: string,
  value: AnswerValue,
  meta: AnswerMeta = {},
): ApplyResult {
  if (isStopped(record)) return { ok: false, error: "interview stopped: danger sign recorded" };
  const current = nextQuestion(record);
  if (!current) return { ok: false, error: "interview already finished" };
  if (current.id !== questionId) return { ok: false, error: `expected an answer to ${current.id}` };
  const q = getQuestion(questionId)!;
  const problem = validateAnswer(q, value);
  if (problem) return { ok: false, error: problem };

  const next = structuredClone(record);
  next.answers.push({
    q: q.id,
    transcript: meta.transcript ?? null,
    value,
    confidence: meta.confidence ?? null,
    confirmed: meta.confirmed ?? true,
    audio_url: meta.audio_url ?? null,
  });
  applyFill(next, q, value);
  applyDanger(next, q, value);
  return { ok: true, record: next };
}

/**
 * Removes the last answer (the shopkeeper's Redo) by replaying the others on
 * a blank interview. Refused once a danger sign is recorded, so Redo can
 * never clear a Red case.
 */
export function undoLast(record: CaseRecord): ApplyResult {
  if (isStopped(record)) return { ok: false, error: "cannot redo after a danger sign" };
  if (record.answers.length === 0) return { ok: false, error: "nothing to redo" };

  const blank = createCase({ case_id: record.case_id, shop_id: record.shop_id, created_at: record.created_at });
  // Keep what the interview doesn't own (tests, review, follow-up).
  let rebuilt: CaseRecord = { ...blank, tests: record.tests, review: record.review, follow_up: record.follow_up };
  for (const a of record.answers.slice(0, -1)) {
    const r = applyAnswer(rebuilt, a.q, a.value, a);
    if (!r.ok) return { ok: false, error: `replay failed at ${a.q}: ${r.error}` };
    rebuilt = r.record;
  }
  return { ok: true, record: rebuilt };
}
