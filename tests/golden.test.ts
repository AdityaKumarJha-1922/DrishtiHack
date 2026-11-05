// The seven golden test cases from docs/Build_spec.md ("Golden test cases").
// M2 is done when all seven pass through the real brain.
import { describe, expect, it } from "vitest";
import { createCase, decide, type CaseRecord } from "../src/brain";

type Partial2<T> = { [K in keyof T]?: T[K] extends object ? Partial2<T[K]> : T[K] };

function makeCase(over: Partial2<CaseRecord>): CaseRecord {
  const base = createCase({ case_id: "T", shop_id: "test", created_at: "2026-11-07T10:00:00+05:30" });
  // Shallow-merge each top-level section so a test only states its key facts.
  const out: Record<string, unknown> = { ...base };
  for (const [k, v] of Object.entries(over)) {
    const b = (base as unknown as Record<string, unknown>)[k];
    out[k] = v && typeof v === "object" && !Array.isArray(v) && b && typeof b === "object" ? { ...b, ...v } : v;
  }
  return out as unknown as CaseRecord;
}

const vision = (right: string, left: string, pinhole: string | null = null) => ({
  distance_va: { right, left, pinhole, distance_m: 3 },
  clock_dial: "even" as const,
  near_point_cm: null,
  working_distance_cm: null,
  quality: { distance_ok: true, light_ok: true, eye_covered: true },
});

describe("golden cases", () => {
  it("1: 52, tailor, near blur, 6/9, near point 40 cm, works at 26 cm -> Green, +2.50", () => {
    const r = decide(makeCase({
      person: { age: 52, occupation: "tailor" },
      symptoms: ["near_blur"],
      tests: { ...vision("6/9", "6/9"), near_point_cm: 40, working_distance_cm: 26 },
    }));
    expect(r.triage.result).toBe("green");
    expect(r.suggestion.power).toBe(2.5);
    expect(r.suggestion.try).toEqual([2, 2.5, 3]);
  });

  it("2: 45, truck driver, 6/18 with pinhole 6/9 -> Amber, driving lenses after the test", () => {
    const r = decide(makeCase({
      person: { age: 45, occupation: "driver" },
      symptoms: ["far_blur"],
      answers: [{ q: "driving", transcript: null, value: "night", confidence: null, confirmed: true, audio_url: null }],
      tests: vision("6/18", "6/18", "6/9"),
    }));
    expect(r.triage.result).toBe("amber");
    expect(r.suggestion.type).toBe("full_test");
    expect(r.suggestion.lenses).toContain("anti_glare_driving_lenses");
  });

  it("3: 60, farmer, sudden blur in one eye -> Red", () => {
    const r = decide(makeCase({ person: { age: 60, occupation: "farmer" }, danger_signs: ["sudden_vision_loss"] }));
    expect(r.triage.result).toBe("red");
    expect(r.suggestion.type).toBe("doctor");
  });

  it("4: 58, shopkeeper with diabetes, no recent change, 6/9 -> Green plus yearly retina check", () => {
    const r = decide(makeCase({
      person: { age: 58, occupation: "shopkeeper" },
      symptoms: ["near_blur"],
      risks: { diabetes: true },
      tests: vision("6/9", "6/9"),
    }));
    expect(r.triage.result).toBe("green");
    expect(r.triage.reasons).toContain("yearly_retina_check");
  });

  it("5: 50, on TB medicine, colours look faded (recent change) -> Red", () => {
    const r = decide(makeCase({
      person: { age: 50 },
      risks: { tb_medicine: true },
      danger_signs: ["recent_change_on_medicine_or_diabetes"],
    }));
    expect(r.triage.result).toBe("red");
  });

  it("6: 35, office worker, eye strain after screen work -> Amber", () => {
    const r = decide(makeCase({ person: { age: 35, occupation: "office_worker" }, symptoms: ["eye_strain"] }));
    expect(r.triage.result).toBe("amber");
  });

  it("7: 65, homemaker, 6/24 and the pinhole doesn't help -> Red", () => {
    const r = decide(makeCase({ person: { age: 65, occupation: "homemaker" }, tests: vision("6/24", "6/24", "6/24") }));
    expect(r.triage.result).toBe("red");
    expect(r.triage.reasons).toContain("reduced_vision_no_pinhole_improvement");
  });
});
