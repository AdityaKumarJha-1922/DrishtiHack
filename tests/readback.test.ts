import { describe, expect, it } from "vitest";
import { getQuestion, parseYesNo, readbackText, voiceAction, type AnswerValue, type Understanding } from "../src/brain";

const q = (id: string) => getQuestion(id)!;
type Extra = Partial<{ confidence: number; needsReadback: boolean; dangerWordsHeard: string[] }>;
const answer = (value: AnswerValue, over: Extra = {}): Understanding => ({
  kind: "answer", value, confidence: 0.95, needsReadback: false, dangerWordsHeard: [], ...over,
});

describe("voiceAction", () => {
  it("reads back key answers even at high confidence", () => {
    expect(voiceAction(q("age"), answer(52))).toBe("read_back");
    expect(voiceAction(q("occupation"), answer("tailor"))).toBe("read_back");
    expect(voiceAction(q("health"), answer(["diabetes"]))).toBe("read_back");
    expect(voiceAction(q("danger_signs"), answer(["none"]))).toBe("read_back");
  });

  it("pre-selects non-key answers at high confidence, reads back when low or danger words heard", () => {
    expect(voiceAction(q("budget"), answer("low"))).toBe("preselect");
    expect(voiceAction(q("budget"), answer("low", { needsReadback: true, confidence: 0.5 }))).toBe("read_back");
    expect(voiceAction(q("driving"), answer("night", { needsReadback: true, dangerWordsHeard: ["flashes"] }))).toBe("read_back");
  });

  it("applies danger answers at once, never reading them back", () => {
    expect(voiceAction(q("danger_signs"), answer(["sudden_vision_loss"]))).toBe("apply_now");
    expect(voiceAction(q("danger_signs"), answer(["painful_red_eye"], { confidence: 0.3, needsReadback: true }))).toBe("apply_now");
    expect(voiceAction(q("recent_change"), answer("yes"))).toBe("apply_now");
    expect(voiceAction(q("recent_change"), answer("no"))).toBe("read_back");
  });

  it("sends unclear and rejected answers to taps", () => {
    expect(voiceAction(q("age"), { kind: "unclear", confidence: 0.2, dangerWordsHeard: [] })).toBe("taps");
    expect(voiceAction(q("age"), { kind: "rejected", reason: "x", dangerWordsHeard: [] })).toBe("taps");
  });
});

describe("readbackText", () => {
  it("uses the template and the question's own labels", () => {
    expect(readbackText(q("age"), 52)).toBe("Aapne kaha: 52 saal. Kya yeh sahi hai?");
    expect(readbackText(q("occupation"), "tailor")).toBe("Aapne kaha: Silai / darzi. Kya yeh sahi hai?");
    expect(readbackText(q("health"), ["diabetes", "tb_medicine"])).toBe("Aapne kaha: Sugar, TB ki dawai. Kya yeh sahi hai?");
    expect(readbackText(q("near_work"), 8)).toBe("Aapne kaha: 8 ghante ya zyada. Kya yeh sahi hai?");
    expect(readbackText(q("recent_change"), "no")).toBe("Aapne kaha: Nahin. Kya yeh sahi hai?");
  });
});

describe("parseYesNo", () => {
  it("reads clear yes and no, in roman and Devanagari", () => {
    expect(parseYesNo("haan")).toBe("yes");
    expect(parseYesNo("Haan ji, sahi hai")).toBe("yes");
    expect(parseYesNo("हाँ")).toBe("yes");
    expect(parseYesNo("nahin")).toBe("no");
    expect(parseYesNo("नहीं, गलत")).toBe("no");
  });
  it("returns null when unclear", () => {
    expect(parseYesNo("theek nahin hai")).toBeNull();
    expect(parseYesNo("ji nahin")).toBeNull();
    expect(parseYesNo("pata nahi kya")).toBe("no"); // contains only a no word: treated as no, which is the safe side
    expect(parseYesNo("baavan saal")).toBeNull();
    expect(parseYesNo("")).toBeNull();
  });
});
