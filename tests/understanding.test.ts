import { describe, expect, it } from "vitest";
import { getQuestion, parseReply, replySchema, RULES } from "../src/brain";

const q = (id: string) => getQuestion(id)!;
const reply = (over: Record<string, unknown>) =>
  JSON.stringify({ question_id: "occupation", path: "person.occupation", unclear: false, value: "tailor", confidence: 0.95, ...over });

describe("reply schema", () => {
  it("allows only the current question, its path and its option values", () => {
    const s = replySchema(q("occupation")) as any;
    expect(s.additionalProperties).toBe(false);
    expect(s.properties.question_id.enum).toEqual(["occupation"]);
    expect(s.properties.path.enum).toEqual(["person.occupation"]);
    expect(s.properties.value.anyOf[0].enum).toContain("tailor");
  });
  it("uses integers for number options and arrays for multi", () => {
    expect((replySchema(q("near_work")) as any).properties.value.anyOf[0]).toMatchObject({ type: "integer" });
    expect((replySchema(q("health")) as any).properties.value.anyOf[0].type).toBe("array");
  });
});

describe("parseReply gate", () => {
  it("accepts a valid answer and flags low confidence for read-back", () => {
    const ok = parseReply(reply({}), q("occupation"), "main silai karti hoon");
    expect(ok).toMatchObject({ kind: "answer", value: "tailor", needsReadback: false });
    const low = parseReply(reply({ confidence: RULES.speech.readback_below_confidence - 0.1 }), q("occupation"), "silai");
    expect(low).toMatchObject({ kind: "answer", needsReadback: true });
  });

  it("rejects malformed JSON, extra or missing fields, wrong question or path", () => {
    const occ = q("occupation");
    expect(parseReply("{not json", occ, "x")).toMatchObject({ kind: "rejected", reason: "malformed_json" });
    expect(parseReply(JSON.stringify({ ...JSON.parse(reply({})), triage: "green" }), occ, "x"))
      .toMatchObject({ kind: "rejected", reason: "unexpected_or_missing_fields" });
    expect(parseReply(JSON.stringify({ question_id: "occupation", value: "tailor" }), occ, "x"))
      .toMatchObject({ kind: "rejected", reason: "unexpected_or_missing_fields" });
    expect(parseReply(reply({ question_id: "age" }), occ, "x")).toMatchObject({ reason: "wrong_question" });
    expect(parseReply(reply({ path: "triage.result" }), occ, "x")).toMatchObject({ reason: "wrong_path" });
    expect(parseReply(null, occ, "x")).toMatchObject({ reason: "not_an_object" });
  });

  it("rejects values outside the question's options or range", () => {
    expect(parseReply(reply({ value: "astronaut" }), q("occupation"), "x").kind).toBe("rejected");
    const age = (value: unknown) =>
      parseReply(JSON.stringify({ question_id: "age", path: "person.age", unclear: false, value, confidence: 0.9 }), q("age"), "x");
    expect(age(52).kind).toBe("answer");
    expect(age(200).kind).toBe("rejected");
    expect(age(52.5).kind).toBe("rejected");
    expect(age("52").kind).toBe("rejected");
  });

  it("rejects bad confidence and conflicting unclear/value", () => {
    const occ = q("occupation");
    expect(parseReply(reply({ confidence: 1.5 }), occ, "x")).toMatchObject({ reason: "bad_confidence" });
    expect(parseReply(reply({ confidence: "high" }), occ, "x")).toMatchObject({ reason: "bad_confidence" });
    expect(parseReply(reply({ unclear: true }), occ, "x")).toMatchObject({ reason: "conflicting_unclear_and_value" });
    expect(parseReply(reply({ value: null }), occ, "x")).toMatchObject({ reason: "conflicting_unclear_and_value" });
    expect(parseReply(reply({ unclear: true, value: null }), occ, "x").kind).toBe("unclear");
  });

  it("takes the safer route when danger words conflict with a 'no danger' answer", () => {
    const d = q("danger_signs");
    const none = JSON.stringify({ question_id: "danger_signs", path: "answers_only", unclear: false, value: ["none"], confidence: 0.9 });
    expect(parseReply(none, d, "kabhi kabhi bijli chamakna")).toMatchObject({
      kind: "rejected", reason: "conflicts_with_danger_words_heard", dangerWordsHeard: ["flashes"],
    });
    expect(parseReply(none, d, "अचानक कम दिखना शुरू हुआ").kind).toBe("rejected");
    expect(parseReply(none, d, "kuch nahin").kind).toBe("answer");
  });

  it("reports danger words heard on other questions and forces read-back", () => {
    const r = parseReply(reply({}), q("occupation"), "silai, aur aankh mein dard bhi");
    expect(r).toMatchObject({ kind: "answer", needsReadback: true, dangerWordsHeard: ["eye_pain"] });
  });
});
