// Speech to text. Order of attempts:
//   1. record with MediaRecorder and send to our `stt` function (Sarvam);
//   2. if our function is not set up, Chrome's own Hindi recognition,
//      only after checking the browser has it (it also needs the internet).
// When neither works the customer answers by tap.
import { callFunction, functionsConfig, isOnline, type CallResult } from "./net";

export type VoiceRoute = "sarvam" | "browser" | null;

const MAX_RECORD_MS = 15_000;
const STT_TIMEOUT_MS = 25_000;

// Chrome exposes speech recognition under a prefixed name; it is not in TS's DOM types.
type BrowserRecognition = {
  lang: string;
  interimResults: boolean;
  maxAlternatives: number;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
};

function browserRecognitionClass(): (new () => BrowserRecognition) | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as Record<string, unknown>;
  return (w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null) as (new () => BrowserRecognition) | null;
}

function canRecord(): boolean {
  return typeof window !== "undefined" && "MediaRecorder" in window && !!navigator.mediaDevices?.getUserMedia;
}

/** Which voice route is usable right now, or null (taps only). */
export function voiceRoute(): VoiceRoute {
  if (!isOnline()) return null;
  if (functionsConfig() && canRecord()) return "sarvam";
  if (browserRecognitionClass()) return "browser";
  return null;
}

/**
 * A recording the UI can stop. Call stop() when the customer finishes;
 * it also stops by itself after MAX_RECORD_MS.
 */
export interface Listening {
  stop(): void;
  // `audio` is the recording (Sarvam route only); it is kept in memory until the
  // case is saved, and uploaded only if the customer consented (Step 5).
  result: Promise<CallResult<{ transcript: string; audio?: Blob }>>;
}

export async function startListening(route: Exclude<VoiceRoute, null>): Promise<CallResult<Listening>> {
  return route === "sarvam" ? recordForSarvam() : listenInBrowser();
}

async function recordForSarvam(): Promise<CallResult<Listening>> {
  let stream: MediaStream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  } catch (e) {
    const name = e instanceof DOMException ? e.name : "";
    return { ok: false, reason: name === "NotAllowedError" ? "mic_denied" : "mic_unavailable" };
  }

  const recorder = new MediaRecorder(stream);
  const chunks: Blob[] = [];
  recorder.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };

  const stopped = new Promise<void>((resolve) => { recorder.onstop = () => resolve(); });
  recorder.start();
  const timer = setTimeout(() => recorder.state !== "inactive" && recorder.stop(), MAX_RECORD_MS);

  const result = (async (): Promise<CallResult<{ transcript: string; audio?: Blob }>> => {
    await stopped;
    clearTimeout(timer);
    stream.getTracks().forEach((t) => t.stop()); // turn the mic off
    const audio = new Blob(chunks, { type: recorder.mimeType || "audio/webm" });
    if (audio.size === 0) return { ok: false, reason: "empty_audio" };
    const form = new FormData();
    form.append("file", audio, "answer.webm");
    const r = await callFunction<{ transcript: string }>("stt", form, STT_TIMEOUT_MS);
    return r.ok ? { ok: true, data: { transcript: r.data.transcript, audio } } : r;
  })();

  return { ok: true, data: { stop: () => recorder.state !== "inactive" && recorder.stop(), result } };
}

function listenInBrowser(): Promise<CallResult<Listening>> {
  const Recognition = browserRecognitionClass();
  if (!Recognition) return Promise.resolve({ ok: false, reason: "no_browser_speech" });
  const rec = new Recognition();
  rec.lang = "hi-IN";
  rec.interimResults = false;
  rec.maxAlternatives = 1;

  const result = new Promise<CallResult<{ transcript: string }>>((resolve) => {
    let done = false;
    const finish = (r: CallResult<{ transcript: string }>) => { if (!done) { done = true; resolve(r); } };
    rec.onresult = (e) => {
      const transcript = e.results[0]?.[0]?.transcript?.trim() ?? "";
      finish(transcript ? { ok: true, data: { transcript } } : { ok: false, reason: "empty_transcript" });
    };
    rec.onerror = (e) => finish({ ok: false, reason: e.error === "not-allowed" ? "mic_denied" : `browser_${e.error}` });
    rec.onend = () => finish({ ok: false, reason: "empty_transcript" });
    setTimeout(() => { rec.abort(); finish({ ok: false, reason: "timeout" }); }, MAX_RECORD_MS + 5_000);
  });
  try {
    rec.start();
  } catch {
    return Promise.resolve({ ok: false, reason: "browser_start_failed" });
  }
  return Promise.resolve({ ok: true, data: { stop: () => rec.stop(), result } });
}
