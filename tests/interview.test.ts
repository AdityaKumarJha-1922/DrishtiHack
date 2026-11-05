import { describe, expect, it } from "vitest";
import {
  applyAnswer, createCase, isStopped, nextQuestion, parseLocalNumber, matchSymptoms,
  progress, undoLast, QUESTIONS, type AnswerValue, type CaseRecord,
} from "../src/brain";

const fresh = () => createCase({ case_id: "T", shop_id: "test", created_at: "2026-11-07T10:00:00+05:30" });

// Answers the current question; fails the test if the brain rejects it.
function answer(r: CaseRecord, id: string, value: AnswerValue): CaseRecord {
  const res = applyAnswer(r, id, value);
  if (!res.ok) throw new Error(`${id}: ${res.error}`);
  return res.record;
}

describe("interview flow", () => {
  it("starts with consent, then the main problem, then danger signs", () => {
    let r = fresh();
    expect(nextQuestion(r)?.id).toBe("consent");
    r = answer(r, "consent", "yes");
    expect(r.consent.given).toBe(true);
    expect(nextQuestion(r)?.id).toBe("main_problem");
    r = answer(r, "main_problem", ["near_blur"]);
    expect(nextQuestion(r)?.id).toBe("danger_signs");
  });

  it("a danger sign stops the interview at once and marks Red", () => {
    let r = answer(answer(fresh(), "consent", "yes"), "main_problem", ["far_blur"]);
    r = answer(r, "danger_signs", ["sudden_vision_loss"]);
    expect(isStopped(r)).toBe(true);
    expect(r.triage.result).toBe("red");
    expect(nextQuestion(r)).toBeNull();
    expect(applyAnswer(r, "age", 50).ok).toBe(false);
  });

  it("Redo cannot clear a danger sign", () => {
    let r = answer(answer(fresh(), "consent", "yes"), "main_problem", ["none"]);
    r = answer(r, "danger_signs", ["painful_red_eye"]);
    const undo = undoLast(r);
    expect(undo.ok).toBe(false);
    expect(r.triage.result).toBe("red");
  });

  it("Redo removes the last answer and its effects", () => {
    let r = answer(fresh(), "consent", "yes");
    r = answer(r, "main_problem", ["near_blur", "eye_strain"]);
    const undo = undoLast(r);
    expect(undo.ok).toBe(true);
    if (undo.ok) {
      expect(undo.record.symptoms).toEqual([]);
      expect(nextQuestion(undo.record)?.id).toBe("main_problem");
    }
  });

  it("rejects invalid answers and leaves the record unchanged", () => {
    const r = fresh();
    expect(applyAnswer(r, "consent", "maybe").ok).toBe(false);
    expect(applyAnswer(r, "age", 50).ok).toBe(false); // not the current question
    const r2 = answer(answer(fresh(), "consent", "no"), "main_problem", ["none"]);
    expect(applyAnswer(r2, "danger_signs", ["none", "painful_red_eye"]).ok).toBe(false);
    expect(applyAnswer(r2, "danger_signs", []).ok).toBe(false);
    expect(r2.answers.length).toBe(2);
  });

  it("validates numbers against min and max", () => {
    let r = answer(answer(fresh(), "consent", "yes"), "main_problem", ["near_blur"]);
    r = answer(r, "danger_signs", ["none"]);
    expect(applyAnswer(r, "age", 200).ok).toBe(false);
    expect(applyAnswer(r, "age", 52.5).ok).toBe(false);
    expect(applyAnswer(r, "age", 52).ok).toBe(true);
  });

  it("under 40 with no near complaint skips the reading block; sun only for outdoor jobs", () => {
    let r = answer(answer(fresh(), "consent", "yes"), "main_problem", ["far_blur"]);
    r = answer(answer(r, "danger_signs", ["none"]), "age", 30);
    r = answer(r, "occupation", "office_worker");
    expect(nextQuestion(r)?.id).toBe("far_vision");
    r = answer(answer(r, "far_vision", "no"), "driving", "no");
    expect(nextQuestion(r)?.id).toBe("current_glasses");
  });

  it("a yes to sugar asks about recent change, and yes there is a danger sign", () => {
    let r = answer(answer(fresh(), "consent", "yes"), "main_problem", ["near_blur"]);
    r = answer(answer(r, "danger_signs", ["none"]), "age", 55);
    r = answer(answer(r, "occupation", "tailor"), "near_work", 8);
    r = answer(answer(r, "phone_reading", 1), "far_vision", "yes");
    r = answer(answer(r, "driving", "no"), "current_glasses", "someone_else");
    r = answer(r, "health", ["diabetes"]);
    expect(r.risks).toMatchObject({ diabetes: true, tb_medicine: false, steroid_drops: false });
    expect(r.tasks.near.hours).toBe(9);
    expect(nextQuestion(r)?.id).toBe("recent_change");
    r = answer(r, "recent_change", "yes");
    expect(r.danger_signs).toEqual(["recent_change_on_medicine_or_diabetes"]);
    expect(r.triage.result).toBe("red");
  });

  it("a full low-risk interview finishes, and progress stays truthful", () => {
    let r = fresh();
    const p0 = progress(r);
    expect(p0).toEqual({ answered: 0, atMost: QUESTIONS.length });
    const plan: [string, AnswerValue][] = [
      ["consent", "yes"], ["main_problem", ["near_blur"]], ["danger_signs", ["none"]], ["age", 52],
      ["occupation", "tailor"], ["near_work", 8], ["phone_reading", 1], ["far_vision", "yes"],
      ["driving", "no"], ["current_glasses", "someone_else"], ["health", ["none"]],
      ["eye_history", ["none"]], ["budget", "low"],
    ];
    for (const [id, v] of plan) {
      const p = progress(r);
      expect(p.atMost).toBeGreaterThanOrEqual(p.answered);
      r = answer(r, id, v);
    }
    expect(nextQuestion(r)).toBeNull();
    expect(progress(r)).toEqual({ answered: 13, atMost: 13 });
  });
});

describe("spoken-word helpers", () => {
  it("parses local quantities", () => {
    expect(parseLocalNumber("dhai ghante")).toEqual({ value: 2.5, unit: "hours" });
    expect(parseLocalNumber("dedh ghanta")).toEqual({ value: 1.5, unit: "hours" });
    expect(parseLocalNumber("sawa do ghante")).toEqual({ value: 2.25, unit: "hours" });
    expect(parseLocalNumber("paune teen")).toEqual({ value: 2.75, unit: null });
    expect(parseLocalNumber("ek bitta door")).toEqual({ value: 1, unit: "hand_span" });
    expect(parseLocalNumber("8 ghante")).toEqual({ value: 8, unit: "hours" });
    expect(parseLocalNumber("pata nahin")).toBeNull();
  });

  it("matches symptom phrases and flags danger words", () => {
    const hits = matchSymptoms("kabhi kabhi bijli chamakna aur paani aana");
    expect(hits.map((h) => h.meaning)).toEqual(["flashes", "watering"]);
    expect(hits.find((h) => h.meaning === "flashes")?.danger).toBe(true);
  });
});
