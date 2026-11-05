// Loads the approved data files. Vite's "?raw" import turns a file into a
// string at build time, so the data ships inside the app and works offline.
// (Python comparison: like reading the file once at import time.)
import { parse } from "yaml";
import questionsYaml from "../../data/questions.yaml?raw";
import rulesYaml from "../../data/rules.yaml?raw";
import symptomCsv from "../../data/symptom_words.csv?raw";
import type { Condition } from "./conditions";

export type QuestionType = "yes_no" | "choice" | "multi" | "number";

export interface Option {
  value: string | number;
  label_hi: string;
}

export interface Fill {
  path: string;
  mode?: "add" | "add_all" | "add_if_no" | "set_flags";
  value?: string;
}

export interface Question {
  id: string;
  text_hi: string;
  type: QuestionType;
  options?: Option[];
  none_value?: string;
  min?: number;
  max?: number;
  ask_if?: Condition;
  danger?: string[];
  danger_code?: string;
  fills: Fill;
}

export interface Rules {
  snellen_lines: string[];
  triage: {
    reduced_worse_than: string;
    pinhole_improves_lines: number;
    green_min_age: number;
    one_eye_worse_lines: number;
    near_complaint_full_test_under_age: number;
    near_complaints: string[];
  };
  reading_power: {
    reserve_share: number;
    round_to: number;
    trial_step: number;
    age_table_40cm: { age: number; add: number }[];
  };
  lens_suggestions: { code: string; when: Condition }[];
  messages: Record<string, string>;
}

export interface SymptomWord {
  phrase: string;
  language: string;
  meaning: string;
  danger: boolean;
}

export const QUESTIONS: Question[] = parse(questionsYaml).questions;
export const RULES: Rules = parse(rulesYaml);

// The CSV has no quoted commas, so a plain split is enough.
export const SYMPTOM_WORDS: SymptomWord[] = symptomCsv
  .trim()
  .split("\n")
  .slice(1)
  .map((line) => {
    const [phrase, language, meaning, danger] = line.split(",").map((s) => s.trim());
    return { phrase, language, meaning, danger: danger === "yes" };
  });

export function getQuestion(id: string): Question | undefined {
  return QUESTIONS.find((q) => q.id === id);
}
