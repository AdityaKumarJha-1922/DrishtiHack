import { describe, expect, it } from "vitest";
import {
  answerChart, applyAnswer, applyTestResult, chartResult, createCase, decide, distanceCm, focalRatio, irisDiameterPx,
  nextTest, optotypeHeightMm, parseDirection, startChart, steadyReading, type AnswerValue, type CaseRecord,
  type ChartState, type Direction,
} from "../src/brain";

const always = (d: Direction) => () => d;

describe("letter size", () => {
  it("a 6/6 E at 3 m is about 4.36 mm tall; 6/60 is ten times that", () => {
    expect(optotypeHeightMm("6/6", 3)).toBeCloseTo(4.363, 2);
    expect(optotypeHeightMm("6/60", 3) / optotypeHeightMm("6/6", 3)).toBeCloseTo(10, 2); // tan() is not quite linear
    expect(() => optotypeHeightMm("<6/60", 3)).toThrow();
  });
});

// Runs a chart where the customer reads every line down to `lastReadable`
// ("6/9" etc.), then gets every letter wrong.
function runChart(lastReadable: string | null): string {
  const lines = ["6/6", "6/9", "6/12", "6/18", "6/24", "6/36", "6/60"];
  let s: ChartState = startChart(always("up"));
  let guard = 0;
  while (!s.done && guard++ < 100) {
    const line = lines[s.lineIndex];
    const canRead = lastReadable !== null && lines.indexOf(line) >= lines.indexOf(lastReadable);
    s = answerChart(s, canRead ? "up" : "down", always("up"));
  }
  return chartResult(s);
}

describe("distance chart procedure", () => {
  it("finds the smallest line read", () => {
    expect(runChart("6/9")).toBe("6/9");
    expect(runChart("6/6")).toBe("6/6");
    expect(runChart("6/60")).toBe("6/60");
    expect(runChart(null)).toBe("<6/60");
  });
  it("passes a line at 3 of 5 and fails once 3 of 5 can't be reached", () => {
    let s = startChart(always("up"));
    for (const a of ["up", "down", "up", "down"] as const) s = answerChart(s, a, always("up"));
    expect(s.lineIndex).toBe(6); // still on 6/60 after 2 right, 2 wrong
    s = answerChart(s, "up", always("up"));
    expect(s.lineIndex).toBe(5); // 3rd right: moved to 6/36
    for (const a of ["down", "cant_see", "left"] as const) s = answerChart(s, a, always("up"));
    expect(s.done).toBe(true);
    expect(chartResult(s)).toBe("6/60");
  });
  it("reads spoken directions locally", () => {
    expect(parseDirection("upar")).toBe("up");
    expect(parseDirection("daayen taraf")).toBe("right");
    expect(parseDirection("नीचे")).toBe("down");
    expect(parseDirection("upar ya neeche")).toBeNull();
    expect(parseDirection("pata nahin")).toBeNull();
  });
});

describe("camera distance", () => {
  // Fake landmarks: two irises `px` pixels wide in a 640-wide frame.
  const face = (px: number) => {
    const pts = Array.from({ length: 478 }, () => ({ x: 0.5, y: 0.5 }));
    pts[469] = { x: 0.3, y: 0.5 }; pts[471] = { x: 0.3 + px / 640, y: 0.5 };
    pts[474] = { x: 0.6, y: 0.5 }; pts[476] = { x: 0.6 + px / 640, y: 0.5 };
    return pts;
  };
  it("calibration at 40 cm then reads distance from iris size", () => {
    const calPx = irisDiameterPx(face(20), 640, 480)!;
    expect(calPx).toBeCloseTo(20, 6);
    const ratio = focalRatio(calPx, 640);
    expect(distanceCm(calPx, 640, ratio)).toBeCloseTo(40, 6);
    expect(distanceCm(40, 640, ratio)).toBeCloseTo(20, 6); // twice the size = half the distance
  });
  it("needs enough steady readings in range", () => {
    expect(steadyReading([30, 31, 29])).toBeNull();
    expect(steadyReading([30, 31, 29, 30, 30, 32, 28, 30, 31, 90])).toBe(30);
    expect(steadyReading(Array(10).fill(5))).toBeNull();
    expect(irisDiameterPx([], 640, 480)).toBeNull();
  });
});

// ---------- the seven golden cases, end to end through the real flows ----------

function interview(plan: [string, AnswerValue][]): CaseRecord {
  let r = createCase({ case_id: "G", shop_id: "test", created_at: "2026-11-07T10:00:00+05:30" });
  for (const [id, v] of plan) {
    const res = applyAnswer(r, id, v);
    if (!res.ok) throw new Error(`${id}: ${res.error}`);
    r = res.record;
  }
  return r;
}
function test(r: CaseRecord, results: Partial<Record<string, string | number | boolean>>): CaseRecord {
  let step = nextTest(r);
  while (step) {
    const v = results[step];
    if (v === undefined) throw new Error(`no result for ${step}`);
    const arg = step === "clock_dial" ? { step, even: v as boolean }
      : step === "near_point" || step === "working_distance" ? { step, cm: v as number }
      : { step, snellen: v as string };
    const res = applyTestResult(r, arg as never, { distance_ok: true, eye_covered: true });
    if (!res.ok) throw new Error(`${step}: ${res.error}`);
    r = res.record;
    step = nextTest(r);
  }
  return decide(r);
}
const base = (age: number, job: string, problems: string[]): [string, AnswerValue][] => [
  ["consent", "yes"], ["main_problem", problems], ["danger_signs", ["none"]], ["age", age], ["occupation", job],
];

describe("golden cases end to end (interview + phone tests + decide)", () => {
  it("1: 52 tailor -> Green, +2.50", () => {
    const r = test(interview([...base(52, "tailor", ["near_blur"]), ["near_work", 8], ["phone_reading", 1], ["far_vision", "yes"],
      ["driving", "no"], ["current_glasses", "someone_else"], ["health", ["none"]], ["eye_history", ["none"]], ["budget", "low"]]),
      { distance_right: "6/9", distance_left: "6/9", clock_dial: true, near_point: 40, working_distance: 26 });
    expect(r.triage.result).toBe("green");
    expect(r.suggestion.power).toBe(2.5);
    expect(r.tests.quality).toMatchObject({ distance_ok: true, eye_covered: true, light_ok: null });
  });
  it("2: 45 truck driver, 6/18 with pinhole 6/9 -> Amber, driving lenses", () => {
    const r = test(interview([...base(45, "driver", ["far_blur"]), ["near_work", 0], ["phone_reading", 1], ["far_vision", "no"],
      ["driving", "night"], ["sun", 6], ["current_glasses", "none"], ["health", ["none"]], ["eye_history", ["none"]], ["budget", "medium"]]),
      { distance_right: "6/18", distance_left: "6/18", pinhole: "6/9", clock_dial: true, near_point: 30, working_distance: 40 });
    expect(r.triage.result).toBe("amber");
    expect(r.suggestion.lenses).toContain("anti_glare_driving_lenses");
  });
  it("3: 60 farmer, sudden blur -> Red at the danger question, no tests", () => {
    const r = interview([...base(60, "farmer", ["far_blur"]).slice(0, 2), ["danger_signs", ["sudden_vision_loss"]]]);
    expect(nextTest(r)).toBeNull();
    expect(decide(r).triage.result).toBe("red");
  });
  it("4: 58 shopkeeper with diabetes, no recent change -> Green + retina check", () => {
    const r = test(interview([...base(58, "shopkeeper", ["near_blur"]), ["near_work", 4], ["phone_reading", 2], ["far_vision", "yes"],
      ["driving", "no"], ["current_glasses", "own"], ["health", ["diabetes"]], ["recent_change", "no"], ["eye_history", ["none"]], ["budget", "low"]]),
      { distance_right: "6/9", distance_left: "6/9", clock_dial: true, near_point: 50, working_distance: 40 });
    expect(r.triage.result).toBe("green");
    expect(r.triage.reasons).toContain("yearly_retina_check");
  });
  it("5: 50 on TB medicine, colours faded -> Red at the recent-change question", () => {
    const r = interview([...base(50, "homemaker", ["far_blur"]), ["near_work", 2], ["phone_reading", 1], ["far_vision", "no"],
      ["driving", "no"], ["current_glasses", "none"], ["health", ["tb_medicine"]], ["recent_change", "yes"]]);
    expect(nextTest(r)).toBeNull();
    expect(decide(r).triage.result).toBe("red");
  });
  it("6: 35 office worker, eye strain -> Amber", () => {
    const r = test(interview([...base(35, "office_worker", ["eye_strain"]), ["far_vision", "yes"], ["driving", "no"],
      ["current_glasses", "none"], ["health", ["none"]], ["eye_history", ["none"]], ["budget", "medium"]]),
      { distance_right: "6/6", distance_left: "6/6", clock_dial: true });
    expect(r.triage.result).toBe("amber");
    expect(r.tests.near_point_cm).toBeNull(); // near tests skipped under 40 without a near complaint
  });
  it("7: 65 homemaker, 6/24 and the pinhole doesn't help -> Red", () => {
    const r = test(interview([...base(65, "homemaker", ["far_blur"]), ["near_work", 2], ["phone_reading", 0], ["far_vision", "no"],
      ["driving", "no"], ["current_glasses", "none"], ["health", ["none"]], ["eye_history", ["none"]], ["walking", "yes"], ["budget", "low"]]),
      { distance_right: "6/24", distance_left: "6/24", pinhole: "6/24", clock_dial: true, near_point: 60, working_distance: 35 });
    expect(r.triage.result).toBe("red");
  });
});

describe("test results are validated", () => {
  const r0 = () => interview([...base(52, "tailor", ["near_blur"])]);
  it("refuses out-of-order steps, bad lines and bad distances", () => {
    expect(applyTestResult(r0(), { step: "distance_left", snellen: "6/9" }).ok).toBe(false);
    expect(applyTestResult(r0(), { step: "distance_right", snellen: "6/7" }).ok).toBe(false);
    let r = r0();
    for (const v of [{ step: "distance_right", snellen: "6/9" }, { step: "distance_left", snellen: "6/9" }, { step: "clock_dial", even: true }]) {
      const res = applyTestResult(r, v as never); if (!res.ok) throw new Error(res.error); r = res.record;
    }
    expect(applyTestResult(r, { step: "near_point", cm: 4 }).ok).toBe(false);
    expect(applyTestResult(r, { step: "near_point", cm: 300 }).ok).toBe(false);
    expect(applyTestResult(r, { step: "near_point", cm: 38.6 }).ok && nextTest(r)).toBe("near_point");
  });
  it("refuses tests on a Red case", () => {
    const red = interview([["consent", "yes"], ["main_problem", ["none"]], ["danger_signs", ["painful_red_eye"]]]);
    expect(applyTestResult(red, { step: "distance_right", snellen: "6/6" }).ok).toBe(false);
  });
});
