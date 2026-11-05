// Minimal access to Postgres (PostgREST) and Storage with the service role.
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided by Supabase to every
// Edge Function; the service key never leaves the server.
import { fetchWithTimeout, secret } from "./http.ts";

const TIMEOUT_MS = 15_000;

export function dbConfig(): { url: string; key: string } | null {
  const url = secret("SUPABASE_URL");
  const key = secret("SUPABASE_SERVICE_ROLE_KEY");
  return url && key ? { url: url.replace(/\/$/, ""), key } : null;
}

function headers(key: string, extra: Record<string, string> = {}): Record<string, string> {
  return { apikey: key, Authorization: `Bearer ${key}`, ...extra };
}

/** The stored record for a case, null when there is none. Throws on a database error. */
export async function getStoredRecord(cfg: { url: string; key: string }, caseId: string): Promise<Record<string, unknown> | null> {
  const res = await fetchWithTimeout(
    `${cfg.url}/rest/v1/cases?case_id=eq.${encodeURIComponent(caseId)}&select=record`,
    { headers: headers(cfg.key) },
    TIMEOUT_MS,
  );
  if (!res.ok) throw new Error(`db_read_${res.status}`);
  const rows = await res.json();
  return Array.isArray(rows) && rows.length ? rows[0].record : null;
}

/** Inserts or replaces the case row. Throws on a database error (including the danger-sign trigger). */
export async function upsertCase(cfg: { url: string; key: string }, record: Record<string, unknown>): Promise<void> {
  const res = await fetchWithTimeout(`${cfg.url}/rest/v1/cases?on_conflict=case_id`, {
    method: "POST",
    headers: headers(cfg.key, { "Content-Type": "application/json", Prefer: "resolution=merge-duplicates,return=minimal" }),
    body: JSON.stringify({ case_id: record.case_id, shop_id: record.shop_id, created_at: record.created_at, record }),
  }, TIMEOUT_MS);
  if (!res.ok) throw new Error(`db_write_${res.status}`);
}

/** Uploads to the private bucket (overwrites the same path, so retries are safe). */
export async function uploadAudio(cfg: { url: string; key: string }, path: string, file: Blob): Promise<void> {
  const res = await fetchWithTimeout(`${cfg.url}/storage/v1/object/case-audio/${path}`, {
    method: "POST",
    headers: headers(cfg.key, { "Content-Type": file.type || "audio/webm", "x-upsert": "true" }),
    body: file,
  }, TIMEOUT_MS * 2);
  if (!res.ok) throw new Error(`storage_${res.status}`);
}
