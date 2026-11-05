// save_audio: stores one consented answer recording in the private bucket.
// In:  multipart: case_id, answer_index, file
// Out: { path } (to put in answers[answer_index].audio_url) or { error }.
// The case must already be saved with consent.given === true, and the answer
// must exist. No retention period is applied here: the spec has none yet.
import { dbConfig, getStoredRecord, uploadAudio } from "../_shared/db.ts";
import { fail, json, preflight } from "../_shared/http.ts";

const MAX_AUDIO_BYTES = 5 * 1024 * 1024;
const SAFE_ID = /^[A-Za-z0-9_-]{1,64}$/;

Deno.serve(async (req) => {
  const early = preflight(req);
  if (early) return early;
  const cfg = dbConfig();
  if (!cfg) return fail("not_configured", 503);

  let caseId: string, index: number, file: File;
  try {
    const form = await req.formData();
    caseId = String(form.get("case_id") ?? "");
    index = Number(form.get("answer_index"));
    const f = form.get("file");
    if (!(f instanceof File)) return fail("no_audio", 400);
    file = f;
  } catch {
    return fail("bad_request", 400);
  }
  if (!SAFE_ID.test(caseId) || !Number.isInteger(index) || index < 0) return fail("bad_request", 400);
  if (file.size === 0) return fail("empty_audio", 400);
  if (file.size > MAX_AUDIO_BYTES) return fail("audio_too_large", 413);

  try {
    const stored = await getStoredRecord(cfg, caseId);
    if (!stored) return fail("case_not_saved", 409);
    const consent = stored.consent as { given?: unknown } | undefined;
    if (consent?.given !== true) return fail("no_consent", 403);
    const answers = Array.isArray(stored.answers) ? stored.answers : [];
    const answer = answers[index] as { q?: unknown } | undefined;
    if (!answer || typeof answer.q !== "string" || !SAFE_ID.test(answer.q)) return fail("no_such_answer", 409);

    const path = `${caseId}/${index}-${answer.q}.webm`;
    await uploadAudio(cfg, path, file);
    return json({ path: `case-audio/${path}` });
  } catch (e) {
    return fail(e instanceof Error && e.message === "timeout" ? "storage_timeout" : "storage_error", 502);
  }
});
