// save_case: stores the canonical case record.
// In:  { record }  (exactly the shape of src/brain/types.ts)
// Out: { saved: true, case_id, urgent } or { error }.
// Refuses: a wrong shape, a save that drops a danger sign, a shop setting a
// review, changes to a reviewed case. The database trigger also blocks
// danger-sign removal, so this holds even if this check were bypassed.
import { caseShapeErrors, resaveError } from "../_shared/case_shape.ts";
import { dbConfig, getStoredRecord, upsertCase } from "../_shared/db.ts";
import { fail, json, preflight } from "../_shared/http.ts";

const MAX_BODY_CHARS = 200_000;

Deno.serve(async (req) => {
  const early = preflight(req);
  if (early) return early;
  const cfg = dbConfig();
  if (!cfg) return fail("not_configured", 503);

  let record: Record<string, unknown>;
  try {
    const text = await req.text();
    if (text.length > MAX_BODY_CHARS) return fail("too_large", 413);
    record = JSON.parse(text)?.record;
  } catch {
    return fail("bad_request", 400);
  }
  const shapeErrors = caseShapeErrors(record);
  if (shapeErrors.length) {
    // Field paths only, never values (they may be customer data).
    return json({ error: "bad_shape", fields: shapeErrors.slice(0, 10).map((e) => e.split(":")[0]) }, 422);
  }

  try {
    const stored = await getStoredRecord(cfg, record.case_id as string);
    const refusal = resaveError(stored, record);
    if (refusal) return fail(refusal, 409);
    await upsertCase(cfg, record);
  } catch (e) {
    return fail(e instanceof Error && e.message === "timeout" ? "db_timeout" : "db_error", 502);
  }
  const urgent = Array.isArray(record.danger_signs) && record.danger_signs.length > 0;
  return json({ saved: true, case_id: record.case_id, urgent });
});
