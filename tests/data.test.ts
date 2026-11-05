// Checks the data files the clinical lead edits (questions.yaml, rules.yaml,
// customer_text.yaml, symptom_words.csv), so a YAML edit can't silently break
// the app: structure, both scripts, and that skip rules only depend on
// questions asked earlier.
import { describe, expect, it } from "vitest";
import { CUSTOMER_TEXT, normalizeText, QUESTIONS, RULES, t } from "../src/brain";
import type { Condition } from "../src/brain/conditions";
import { SYMPTOM_WORDS } from "../src/brain/data";

const DEVANAGARI = /[ऀ-ॿ]/;
const placeholders = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

function fieldsOf(c: Condition): string[] {
  if ("all" in c) return c.all.flatMap(fieldsOf);
  if ("any" in c) return c.any.flatMap(fieldsOf);
  return [c.field];
}

// For each field a condition can read, the positions of the questions that fill it.
function fillers(): Map<string, number[]> {
  const m = new Map<string, number[]>();
  const add = (field: string, i: number) => m.set(field, [...(m.get(field) ?? []), i]);
  QUESTIONS.forEach((q, i) => {
    add(`answer.${q.id}`, i);
    const { path, mode } = q.fills;
    if (path === "risks" && mode === "set_flags") {
      for (const o of q.options ?? []) if (o.value !== q.none_value) add(`risks.${o.value}`, i);
    } else if (path !== "answers_only") {
      add(path, i);
    }
  });
  return m;
}

describe("questions.yaml", () => {
  it("has unique ids, and every question in both scripts", () => {
    const ids = QUESTIONS.map((q) => q.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const q of QUESTIONS) {
      expect(q.text_hi?.trim(), q.id).toBeTruthy();
      expect(q.text_deva ?? "", `${q.id} text_deva`).toMatch(DEVANAGARI);
      if (q.unit_hi) expect(q.unit_deva ?? "", `${q.id} unit_deva`).toMatch(DEVANAGARI);
    }
  });

  it("has well-formed options and danger answers", () => {
    for (const q of QUESTIONS) {
      const values = (q.options ?? []).map((o) => o.value);
      if (q.type === "choice" || q.type === "multi") {
        expect(values.length, q.id).toBeGreaterThan(1);
        expect(new Set(values).size, `${q.id} duplicate option`).toBe(values.length);
        for (const o of q.options!) {
          expect(o.label_hi?.trim(), `${q.id}.${o.value}`).toBeTruthy();
          expect(o.label_deva ?? "", `${q.id}.${o.value} label_deva`).toMatch(DEVANAGARI);
        }
      } else {
        expect(q.options, `${q.id} should have no options`).toBeUndefined();
      }
      if (q.type === "multi" && q.none_value) expect(values, q.id).toContain(q.none_value);
      if (q.type === "number") expect(q.min!, q.id).toBeLessThan(q.max!);
      if (q.danger) {
        const allowed = q.type === "yes_no" ? ["yes", "no"] : values.map(String);
        for (const d of q.danger) expect(allowed, `${q.id} danger ${d}`).toContain(d);
        if (q.type === "yes_no") expect(q.danger_code, q.id).toBeTruthy();
        if (q.none_value) expect(q.danger, q.id).not.toContain(q.none_value);
      }
    }
  });

  it("fills only paths the brain knows", () => {
    const known = new Set(["consent.given", "person.age", "person.occupation", "tasks.near.hours:add", "symptoms:add_all",
      "symptoms:add_if_no", "risks:set_flags", "answers_only"]);
    for (const q of QUESTIONS) {
      const key = q.fills.mode ? `${q.fills.path}:${q.fills.mode}` : q.fills.path;
      expect(known, `${q.id} fills ${key}`).toContain(key);
    }
  });

  it("skips a question only on answers to EARLIER questions", () => {
    const f = fillers();
    QUESTIONS.forEach((q, i) => {
      if (!q.ask_if) return;
      for (const field of fieldsOf(q.ask_if)) {
        const by = f.get(field) ?? [];
        expect(by.some((j) => j < i), `${q.id} reads ${field}, which no earlier question fills`).toBe(true);
      }
    });
  });
});

describe("rules.yaml", () => {
  it("reads only fields that a question or decide() fills", () => {
    const f = fillers();
    const conds = [...RULES.lens_suggestions.map((l) => l.when), RULES.phone_tests.near.run_if];
    for (const field of conds.flatMap(fieldsOf)) {
      expect(field === "triage.result" || f.has(field), `rules.yaml reads ${field}`).toBe(true);
    }
    const codes = RULES.lens_suggestions.map((l) => l.code);
    expect(new Set(codes).size).toBe(codes.length);
  });

  it("uses chart lines that exist", () => {
    const lines = RULES.snellen_lines;
    expect(new Set(lines).size).toBe(lines.length);
    for (const l of [RULES.triage.reduced_worse_than, RULES.phone_tests.distance_chart.start_line, RULES.phone_tests.near.target_snellen]) {
      expect(lines).toContain(l);
    }
    const c = RULES.phone_tests.distance_chart;
    expect(c.pass_correct).toBeLessThanOrEqual(c.letters_per_line);
    expect(RULES.speech.readback_below_confidence).toBeGreaterThan(0);
    expect(RULES.speech.readback_below_confidence).toBeLessThan(1);
  });

  it("keeps spoken word lists apart (yes/no, and the four directions)", () => {
    const yes = RULES.speech.yes_words.map(normalizeText), no = RULES.speech.no_words.map(normalizeText);
    expect(yes.filter((w) => no.includes(w))).toEqual([]);
    const dirs = Object.values(RULES.phone_tests.direction_words).map((ws) => ws.map(normalizeText));
    const all = dirs.flat();
    expect(new Set(all).size, "a word is listed for two directions").toBe(all.length);
  });
});

describe("customer_text.yaml", () => {
  it("has every text in both scripts, with the same placeholders", () => {
    expect(["latn", "deva"]).toContain(CUSTOMER_TEXT.default_script);
    expect(["latn", "deva"]).toContain(CUSTOMER_TEXT.speak_script);
    for (const [key, e] of Object.entries(CUSTOMER_TEXT.texts)) {
      expect(["draft", "approved"], key).toContain(e.status);
      expect(e.latn?.trim(), `${key} latn`).toBeTruthy();
      expect(e.deva ?? "", `${key} deva`).toMatch(DEVANAGARI);
      expect(placeholders(e.deva), `${key} placeholders`).toEqual(placeholders(e.latn));
    }
  });

  it("has every text key the app uses", () => {
    // Literal keys passed to t(...) or set as a voice note anywhere in src/.
    // import.meta.glob (Vite) loads every source file as text.
    const sources = import.meta.glob("../src/**/*.{ts,tsx}", { query: "?raw", import: "default", eager: true }) as Record<string, string>;
    const keys = new Set<string>();
    for (const src of Object.values(sources)) {
      for (const m of src.matchAll(/\bt\(([^,)]*)/g)) for (const k of m[1].matchAll(/"([a-z_]+)"/g)) keys.add(k[1]);
      for (const m of src.matchAll(/setVoiceNote\(\s*([^;]*?)\);/g)) for (const k of m[1].matchAll(/"([a-z_]+)"/g)) keys.add(k[1]);
    }
    // Keys the app reaches through a lookup table (add new indirect keys here).
    for (const k of ["chart_right_eye", "chart_left_eye", "chart_pinhole", "result_green", "result_amber", "result_pending"]) keys.add(k);
    expect(keys.size).toBeGreaterThan(20);
    for (const k of keys) expect(Object.keys(CUSTOMER_TEXT.texts), `missing text "${k}"`).toContain(k);
    expect(t("no_such_key", "deva")).toBe("[missing: no_such_key]");
    expect(t("progress_question", "deva", { n: 3 })).toBe("सवाल 3");
  });
});

describe("symptom_words.csv and text matching", () => {
  it("has unique phrases", () => {
    const phrases = SYMPTOM_WORDS.map((w) => normalizeText(w.phrase));
    expect(new Set(phrases).size).toBe(phrases.length);
  });
  it("treats both Unicode spellings of a Devanagari letter as the same", () => {
    const composed = "ज़"; // ज़ as one character
    const decomposed = "ज़"; // ज + nukta
    expect(normalizeText(composed)).toBe(normalizeText(decomposed));
    expect(normalizeText("आँख‍ में")).toBe("आँख में");
  });
});
