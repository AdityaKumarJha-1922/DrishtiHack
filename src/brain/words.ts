// Helpers for spoken answers (used from Step 2 on; tested now).
import { SYMPTOM_WORDS, type SymptomWord } from "./data";

const NUMBER_WORDS: Record<string, number> = {
  ek: 1, do: 2, teen: 3, char: 4, chaar: 4, paanch: 5, panch: 5,
  chhe: 6, chhah: 6, saat: 7, aath: 8, nau: 9, das: 10,
};

/**
 * Reads a spoken Hindi quantity: "dhai ghante" -> 2.5, "sawa do" -> 2.25,
 * "paune teen" -> 2.75, "dedh" -> 1.5, "4" -> 4, "ek bitta" -> 1 hand-span.
 * Returns null when no number is found. The unit is reported, never converted.
 */
export function parseLocalNumber(text: string): { value: number; unit: "hours" | "hand_span" | null } | null {
  const words = text.toLowerCase().replace(/[^a-z0-9.\s]/g, " ").split(/\s+/).filter(Boolean);
  const unit = words.some((w) => w.startsWith("bitt")) ? "hand_span"
    : words.some((w) => w.startsWith("ghant")) ? "hours" : null;

  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    if (w === "dedh" || w === "derh") return { value: 1.5, unit };
    if (w === "dhai" || w === "dhaai") return { value: 2.5, unit };
    const nextNum = (): number | null => {
      const n = words[i + 1];
      if (n === undefined) return null;
      if (/^\d+(\.\d+)?$/.test(n)) return Number(n);
      return NUMBER_WORDS[n] ?? null;
    };
    if (w === "sawa") { const n = nextNum(); return n === null ? null : { value: n + 0.25, unit }; }
    if (w === "paune") { const n = nextNum(); return n === null ? null : { value: n - 0.25, unit }; }
    if (/^\d+(\.\d+)?$/.test(w)) return { value: Number(w), unit };
    if (w in NUMBER_WORDS) return { value: NUMBER_WORDS[w], unit };
  }
  return null;
}

/** Finds known symptom phrases in a transcript (from data/symptom_words.csv). */
export function matchSymptoms(text: string, words: SymptomWord[] = SYMPTOM_WORDS): SymptomWord[] {
  const t = text.toLowerCase();
  return words.filter((w) => t.includes(w.phrase));
}
