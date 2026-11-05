// Text to speech for the Repeat button. Order of attempts:
//   1. our `tts` function (Sarvam Bulbul), cached per question text;
//   2. the phone's own Hindi voice, if it has one.
// Returns false when neither worked, so the screen can highlight the text instead.
import { callFunction } from "./net";

const TTS_TIMEOUT_MS = 15_000;
const cache = new Map<string, string>(); // question text -> data URL

let current: HTMLAudioElement | null = null;

async function playSarvam(text: string): Promise<boolean> {
  let src = cache.get(text);
  if (!src) {
    const r = await callFunction<{ audio_base64: string; mime: string }>("tts", { text }, TTS_TIMEOUT_MS);
    if (!r.ok || typeof r.data.audio_base64 !== "string") return false;
    src = `data:${r.data.mime || "audio/wav"};base64,${r.data.audio_base64}`;
    cache.set(text, src);
  }
  try {
    current?.pause();
    current = new Audio(src);
    await current.play();
    return true;
  } catch {
    return false; // e.g. autoplay blocked or a bad audio file
  }
}

function playPhoneVoice(text: string): boolean {
  if (typeof window === "undefined" || !("speechSynthesis" in window) || !("SpeechSynthesisUtterance" in window)) {
    return false;
  }
  const hindi = window.speechSynthesis.getVoices().find((v) => v.lang.toLowerCase().startsWith("hi"));
  if (!hindi) return false;
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.voice = hindi;
  u.lang = hindi.lang;
  u.rate = 0.85; // slow, per the counter UX rules
  window.speechSynthesis.speak(u);
  return true;
}

export async function speak(text: string): Promise<boolean> {
  if (await playSarvam(text)) return true;
  return playPhoneVoice(text);
}
