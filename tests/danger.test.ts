// Step 4: a danger sign stops the interview, makes the case Red and urgent,
// and nothing can clear or downgrade it.
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  applyAnswer, createCase, decide, getQuestion, isStopped, isUrgent, nextQuestion, parseReply,
  progress, QUESTIONS, reportDangerLater, reportableDangerSigns, undoLast, voiceAction,
  type AnswerValue, type CaseRecord,
} from "../src/brain";
import { understand } from "../src/services/understand";

const fresh = () => createCase({ case_id: "T", shop_id: "test", created_at: "2026-11-07T10:00:00+05:30" });
function answer(r: CaseRecord, id: string, value: AnswerValue): CaseRecord {
  const res = applyAnswer(r, id, value);
  if (!res.ok) throw new Error(`${id}: ${res.error}`);
  return res.record;
}
const toDangerQuestion = () => answer(answer(fresh(), "consent", "yes"), "main_problem", ["near_blur"]);

// A case that would be Green if it had no danger sign.
function greenEligible(r: CaseRecord): CaseRecord {
  const c = structuredClone(r);
  c.person.age = 52;
  c.tests = {
    distance_va: { right: "6/6", left: "6/6", pinhole: null, distance_m: 3 },
    clock_dial: "even", near_point_cm: 40, working_distance_cm: 26,
    quality: { distance_ok: true, light_ok: true, eye_covered: true },
  };
  return c;
}

function expectLockedRed(r: CaseRecord) {
  expect(isStopped(r)).toBe(true);
  expect(isUrgent(r)).toBe(true);
  expect(r.triage.result).toBe("red");
  expect(nextQuestion(r)).toBeNull();
}

describe("every danger answer stops the interview", () => {
  for (const code of getQuestion("danger_signs")!.danger!) {
    it(`danger_signs: ${code}`, () => {
      const r = answer(toDangerQuestion(), "danger_signs", [code]);
      expectLockedRed(r);
      expect(r.danger_signs).toEqual([code]);
    });
  }

  it("recent change while on diabetes or TB medicine", () => {
    let r = answer(answer(toDangerQuestion(), "danger_signs", ["none"]), "age", 55);
    r = answer(answer(r, "occupation", "tailor"), "near_work", 2);
    r = answer(answer(r, "phone_reading", 1), "far_vision", "yes");
    r = answer(answer(r, "driving", "no"), "current_glasses", "none");
    r = answer(answer(r, "health", ["tb_medicine"]), "recent_change", "yes");
    expectLockedRed(r);
  });

  it("progress shows the interview as finished, not waiting for more questions", () => {
    const r = answer(toDangerQuestion(), "danger_signs", ["painful_red_eye"]);
    expect(progress(r)).toEqual({ answered: 3, atMost: 3 });
  });
});

describe("nothing can clear or downgrade Red", () => {
  const red = () => answer(toDangerQuestion(), "danger_signs", ["sudden_vision_loss"]);

  it("no further answer is accepted, for any question", () => {
    const r = red();
    for (const q of QUESTIONS) {
      const v: AnswerValue = q.type === "yes_no" ? "no" : q.type === "number" ? 50 : q.type === "multi" ? [q.none_value!] : q.options![0].value;
      expect(applyAnswer(r, q.id, v).ok).toBe(false);
    }
    expectLockedRed(r);
  });

  it("a retry of the same or a 'none' answer is refused and changes nothing", () => {
    const r = red();
    const before = JSON.stringify(r);
    expect(applyAnswer(r, "danger_signs", ["sudden_vision_loss"]).ok).toBe(false);
    expect(applyAnswer(r, "danger_signs", ["none"]).ok).toBe(false);
    expect(JSON.stringify(r)).toBe(before);
  });

  it("Redo (undoLast) is refused", () => {
    const r = red();
    expect(undoLast(r).ok).toBe(false);
    expectLockedRed(r);
  });

  it("decide() keeps Red even when every test would give Green", () => {
    const d = decide(greenEligible(red()));
    expect(d.triage.result).toBe("red");
    expect(d.suggestion.type).toBe("doctor");
    expect(d.suggestion.power).toBeNull();
    expect(d.suggestion.lenses).toEqual([]);
  });

  it("a record tampered to Green is still treated as Red", () => {
    const t = greenEligible(red());
    t.triage = { result: "green", reasons: [] };
    expect(isStopped(t)).toBe(true);
    expect(nextQuestion(t)).toBeNull();
    expect(decide(t).triage.result).toBe("red");
  });

  it("a model reply cannot downgrade: 'none' with danger words is rejected; a danger reply applies at once", () => {
    const q = getQuestion("danger_signs")!;
    const none = JSON.stringify({ question_id: "danger_signs", path: "answers_only", unclear: false, value: ["none"], confidence: 1 });
    expect(parseReply(none, q, "aankh mein dard hai").kind).toBe("rejected");
    const hit = parseReply(
      JSON.stringify({ question_id: "danger_signs", path: "answers_only", unclear: false, value: ["painful_red_eye"], confidence: 0.4 }),
      q, "dard",
    );
    expect(voiceAction(q, hit)).toBe("apply_now");
  });
});

describe("network failure keeps the safety net", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("a failed understand call still reports danger words heard", async () => {
    vi.stubEnv("VITE_SUPABASE_URL", "https://x.supabase.co");
    vi.stubEnv("VITE_SUPABASE_ANON_KEY", "anon");
    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("offline"); }));
    const u = await understand(getQuestion("occupation")!, "bijli chamakna dikhta hai");
    expect(u).toMatchObject({ kind: "rejected", reason: "network", dangerWordsHeard: ["flashes"] });
    vi.unstubAllEnvs();
  });
});

describe("shopkeeper reports a danger sign later (escalation only)", () => {
  it("mid-interview: adds the sign, stops, and goes Red", () => {
    let r = answer(answer(toDangerQuestion(), "danger_signs", ["none"]), "age", 52);
    const res = reportDangerLater(r, "flashes_or_curtain");
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    r = res.record;
    expectLockedRed(r);
    expect(r.danger_signs).toEqual(["reported_later:flashes_or_curtain"]);
    expect(r.answers.at(-1)!.q).toBe("age"); // the customer's answers are untouched
  });

  it("after a finished interview, decide() then gives Red", () => {
    const done = greenEligible(answer(toDangerQuestion(), "danger_signs", ["none"]));
    expect(decide(done).triage.result).toBe("green");
    const res = reportDangerLater(done, "painful_red_eye");
    expect(res.ok && decide(res.record).triage.result).toBe("red");
  });

  it("only accepts danger answers from questions.yaml, and never removes one", () => {
    const r = answer(toDangerQuestion(), "danger_signs", ["sudden_vision_loss"]);
    expect(reportDangerLater(r, "none").ok).toBe(false);
    expect(reportDangerLater(r, "near_blur").ok).toBe(false);
    const res = reportDangerLater(r, "injury_or_chemical");
    expect(res.ok && res.record.danger_signs).toEqual(["sudden_vision_loss", "reported_later:injury_or_chemical"]);
    expect(reportableDangerSigns()).toContain("injury_or_chemical");
  });
});
