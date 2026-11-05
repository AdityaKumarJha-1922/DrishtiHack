// stt: speech to text with Sarvam.
// In:  multipart form, field "file" = the recorded audio (webm/ogg/wav...).
// Out: { transcript } or { error }.
// The model is a secret-side setting. Default "saarika:v2.5" follows the spec;
// Sarvam now lists it as legacy (saaras:v3 is their recommended model).
import { fail, fetchWithTimeout, json, preflight, secret } from "../_shared/http.ts";

const SARVAM_STT_URL = "https://api.sarvam.ai/speech-to-text";
const MAX_AUDIO_BYTES = 5 * 1024 * 1024; // about a minute of compressed speech
const TIMEOUT_MS = 20_000;

Deno.serve(async (req) => {
  const early = preflight(req);
  if (early) return early;

  const key = secret("SARVAM_API_KEY");
  if (!key) return fail("not_configured", 503);

  let file: File;
  try {
    const form = await req.formData();
    const f = form.get("file");
    if (!(f instanceof File)) return fail("no_audio", 400);
    file = f;
  } catch {
    return fail("bad_request", 400);
  }
  if (file.size === 0) return fail("empty_audio", 400);
  if (file.size > MAX_AUDIO_BYTES) return fail("audio_too_large", 413);

  const body = new FormData();
  body.append("file", file, file.name || "answer.webm");
  body.append("model", secret("SARVAM_STT_MODEL") ?? "saarika:v2.5");
  body.append("language_code", "hi-IN");

  let res: Response;
  try {
    res = await fetchWithTimeout(SARVAM_STT_URL, {
      method: "POST",
      headers: { "api-subscription-key": key },
      body,
    }, TIMEOUT_MS);
  } catch (e) {
    return fail(e instanceof Error && e.message === "timeout" ? "provider_timeout" : "provider_unreachable", 504);
  }
  if (!res.ok) return fail(`provider_http_${res.status}`, 502);

  try {
    const data = await res.json();
    const transcript = typeof data?.transcript === "string" ? data.transcript.trim() : "";
    if (!transcript) return fail("empty_transcript", 422);
    return json({ transcript });
  } catch {
    return fail("provider_bad_json", 502);
  }
});
