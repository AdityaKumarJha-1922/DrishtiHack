// Danger signs (Step 4). A danger sign is one-way: once recorded it stops the
// interview, makes the case Red and urgent, and nothing in the app can remove
// it (no retry, Redo, override, model reply, or software fallback).
//
// The case record has no separate "urgent" field: a case is urgent exactly
// when it has a danger sign, so urgency is derived here, never stored twice.
import { getQuestion } from "./data";
import type { ApplyResult } from "./interview";
import type { CaseRecord } from "./types";

/** Code prefix for a danger sign the shopkeeper reports after the danger question. */
export const LATE_REPORT_PREFIX = "reported_later:";

export function isUrgent(record: CaseRecord): boolean {
  return record.danger_signs.length > 0;
}

/** Makes triage Red with one reason per danger sign. Call after adding any danger sign. */
export function markRed(record: CaseRecord): void {
  record.triage = { result: "red", reasons: record.danger_signs.map((d) => `danger_sign:${d}`) };
}

/** The danger answers the shopkeeper may report, from the danger question in questions.yaml. */
export function reportableDangerSigns(): string[] {
  return getQuestion("danger_signs")?.danger ?? [];
}

/**
 * The shopkeeper reports a danger sign heard later in the interview (or after it).
 * Escalation only: it adds a danger sign, stops the interview and makes the case
 * Red. It can never remove one. The code must be one of the danger answers in
 * questions.yaml; it is stored as "reported_later:<code>".
 */
export function reportDangerLater(record: CaseRecord, code: string): ApplyResult {
  if (!reportableDangerSigns().includes(code)) return { ok: false, error: `not a danger sign: ${code}` };
  const next = structuredClone(record);
  const entry = `${LATE_REPORT_PREFIX}${code}`;
  if (!next.danger_signs.includes(entry)) next.danger_signs.push(entry);
  markRed(next);
  return { ok: true, record: next };
}
