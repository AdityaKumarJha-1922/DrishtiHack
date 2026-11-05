// The phone's own text-to-speech, used only by the Repeat button in Step 1.
// Feature-detected: never assume the browser has it or has a Hindi voice.

export function canSpeak(): boolean {
  return typeof window !== "undefined" && "speechSynthesis" in window && "SpeechSynthesisUtterance" in window;
}

/** Returns false when no Hindi voice is available, so the caller can fall back. */
export function speakHindi(text: string): boolean {
  if (!canSpeak()) return false;
  const voices = window.speechSynthesis.getVoices();
  const hindi = voices.find((v) => v.lang.toLowerCase().startsWith("hi"));
  if (!hindi) return false;
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.voice = hindi;
  u.lang = hindi.lang;
  u.rate = 0.85; // slow, per the counter UX rules
  window.speechSynthesis.speak(u);
  return true;
}
