// tts: text to speech with Sarvam Bulbul.
// In:  { text } (the question as written in questions.yaml).
// Out: { audio_base64, mime: "audio/wav" } or { error }.
import { fail, fetchWithTimeout, json, preflight, secret } from "../_shared/http.ts";

const SARVAM_TTS_URL = "https://api.sarvam.ai/text-to-speech";
const MAX_TEXT = 500; // our questions are short; Bulbul allows more
const TIMEOUT_MS = 15_000;

Deno.serve(async (req) => {
  const early = preflight(req);
  if (early) return early;

  const key = secret("SARVAM_API_KEY");
  if (!key) return fail("not_configured", 503);

  let text: unknown;
  try {
    text = (await req.json())?.text;
  } catch {
    return fail("bad_request", 400);
  }
  if (typeof text !== "string" || !text.trim()) return fail("no_text", 400);
  if (text.length > MAX_TEXT) return fail("text_too_long", 413);

  const payload: Record<string, unknown> = {
    text,
    language_code: "hi-IN",
    model: secret("SARVAM_TTS_MODEL") ?? "bulbul:v3",
    pace: 0.85, // slow, per the counter UX rules
  };
  const speaker = secret("SARVAM_TTS_SPEAKER"); // must match the model; omit for the API default
  if (speaker) payload.speaker = speaker;

  let res: Response;
  try {
    res = await fetchWithTimeout(SARVAM_TTS_URL, {
      method: "POST",
      headers: { "api-subscription-key": key, "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }, TIMEOUT_MS);
  } catch (e) {
    return fail(e instanceof Error && e.message === "timeout" ? "provider_timeout" : "provider_unreachable", 504);
  }
  if (!res.ok) return fail(`provider_http_${res.status}`, 502);

  try {
    const data = await res.json();
    const audio = Array.isArray(data?.audios) ? data.audios[0] : null;
    if (typeof audio !== "string" || !audio) return fail("provider_no_audio", 502);
    return json({ audio_base64: audio, mime: "audio/wav" });
  } catch {
    return fail("provider_bad_json", 502);
  }
});
