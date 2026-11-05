// Saving a case (Step 5). Order:
//   1. save the record (save_case);
//   2. if the customer consented, upload each kept voice recording (save_audio)
//      and put its private storage path in answers[i].audio_url;
//   3. save the record again with those paths.
// Success is reported only when the server confirmed every step; anything else
// comes back as a reason the shopkeeper sees.
import type { CaseRecord } from "../brain";
import { callFunction } from "./net";

const SAVE_TIMEOUT_MS = 20_000;
const AUDIO_TIMEOUT_MS = 40_000;

export type SaveResult =
  | { ok: true; record: CaseRecord; audioSaved: number }
  | { ok: false; reason: string; record: CaseRecord; caseSaved: boolean };

async function saveRecord(record: CaseRecord) {
  return callFunction<{ saved: boolean }>("save_case", { record }, SAVE_TIMEOUT_MS);
}

/** `audio` maps an answer's index in record.answers to its recording. */
export async function saveCase(record: CaseRecord, audio: Map<number, Blob>): Promise<SaveResult> {
  const first = await saveRecord(record);
  if (!first.ok || !first.data.saved) {
    return { ok: false, reason: first.ok ? "not_saved" : first.reason, record, caseSaved: false };
  }

  // Audio only with consent, and only for answers that have none stored yet.
  if (record.consent.given !== true || audio.size === 0) return { ok: true, record, audioSaved: 0 };
  const next = structuredClone(record);
  let uploaded = 0;
  for (const [index, blob] of [...audio.entries()].sort((a, b) => a[0] - b[0])) {
    const answer = next.answers[index];
    if (!answer || answer.audio_url) continue;
    const form = new FormData();
    form.append("case_id", next.case_id);
    form.append("answer_index", String(index));
    form.append("file", blob, `${index}.webm`);
    const up = await callFunction<{ path: string }>("save_audio", form, AUDIO_TIMEOUT_MS);
    if (!up.ok) return { ok: false, reason: `audio_${up.reason}`, record: next, caseSaved: true };
    answer.audio_url = up.data.path;
    uploaded++;
  }
  if (uploaded === 0) return { ok: true, record, audioSaved: 0 };

  const second = await saveRecord(next);
  if (!second.ok) return { ok: false, reason: `paths_${second.reason}`, record: next, caseSaved: true };
  return { ok: true, record: next, audioSaved: uploaded };
}
