// The server's shape check must match src/brain/types.ts exactly.
import { describe, expect, it } from "vitest";
import { caseShapeErrors, resaveError } from "../supabase/functions/_shared/case_shape";
import { applyAnswer, createCase, decide, reportDangerLater, type AnswerValue, type CaseRecord } from "../src/brain";

const fresh = () => createCase({ case_id: "NS-1", shop_id: "shop-01", created_at: "2026-11-07T10:00:00+05:30" });
function answer(r: CaseRecord, id: string, value: AnswerValue, meta = {}): CaseRecord {
  const res = applyAnswer(r, id, value, meta);
  if (!res.ok) throw new Error(res.error);
  return res.record;
}

describe("case shape", () => {
  it("accepts a blank case, a voice-answered interview, and a decided case", () => {
    expect(caseShapeErrors(fresh())).toEqual([]);
    let r = answer(fresh(), "consent", "yes");
    r = answer(r, "main_problem", ["near_blur"], { transcript: "paas ka dhundhla", confidence: 0.9, audio_url: "case-audio/NS-1/1-main_problem.webm" });
    r = answer(r, "danger_signs", ["none"]);
    expect(caseShapeErrors(r)).toEqual([]);
    expect(caseShapeErrors(decide(r))).toEqual([]);
    const late = reportDangerLater(r, "painful_red_eye");
    expect(late.ok && caseShapeErrors(late.record)).toEqual([]);
  });

  it("rejects extra, missing and wrongly typed fields", () => {
    const extra = { ...fresh(), urgent: true };
    expect(caseShapeErrors(extra)).toContain(": unexpected field urgent");
    const { triage: _t, ...missing } = fresh();
    expect(caseShapeErrors(missing).join()).toContain("missing triage");
    const wrong = fresh() as any;
    wrong.person.age = "52";
    expect(caseShapeErrors(wrong)).toEqual(["person.age: expected number"]);
    const badEnum = fresh() as any;
    badEnum.triage.result = "yellow";
    expect(caseShapeErrors(badEnum)[0]).toMatch(/^triage.result: not one of/);
    const deep = fresh() as any;
    deep.tests.quality.blur = 1;
    expect(caseShapeErrors(deep)).toEqual(["tests.quality: unexpected field blur"]);
    expect(caseShapeErrors(null)).toEqual([": expected object"]);
  });
});

describe("re-save rules", () => {
  const red = () => answer(answer(answer(fresh(), "consent", "yes"), "main_problem", ["none"]), "danger_signs", ["painful_red_eye"]);

  it("allows a first save and a save that only adds", () => {
    expect(resaveError(null, fresh() as any)).toBeNull();
    const late = reportDangerLater(red(), "flashes_or_curtain");
    expect(late.ok && resaveError(red(), late.record as any)).toBeNull();
  });
  it("refuses dropping a danger sign", () => {
    expect(resaveError(red(), fresh() as any)).toBe("danger_sign_removed");
  });
  it("refuses a review from the shop, and changes to a reviewed case", () => {
    const withReview = { ...fresh(), review: { optometrist_id: "o", decision: "approved", edits: null, seconds: 60, reply_audio_url: null } };
    expect(resaveError(null, withReview as any)).toBe("review_set_by_shop");
    expect(resaveError(withReview, fresh() as any)).toBe("already_reviewed");
  });
  it("refuses a different shop writing the same case id", () => {
    expect(resaveError(fresh(), { ...fresh(), shop_id: "shop-99" } as any)).toBe("shop_mismatch");
  });
});
