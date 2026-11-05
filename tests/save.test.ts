import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { applyAnswer, createCase, type CaseRecord } from "../src/brain";
import { saveCase } from "../src/services/save";

function interview(consent: "yes" | "no"): CaseRecord {
  let r = createCase({ case_id: "NS-1", shop_id: "shop-01", created_at: "2026-11-07T10:00:00+05:30" });
  for (const [id, v] of [["consent", consent], ["main_problem", ["near_blur"]]] as const) {
    const res = applyAnswer(r, id, v as never, id === "main_problem" ? { transcript: "paas", confidence: 0.9 } : {});
    if (!res.ok) throw new Error(res.error);
    r = res.record;
  }
  return r;
}

type Reply = { status: number; body: unknown } | "throw";
let calls: { name: string; body: unknown }[] = [];
function serve(replies: Record<string, Reply[]>) {
  vi.stubGlobal("fetch", vi.fn(async (url: string, init: RequestInit) => {
    const name = url.split("/").pop()!;
    const body = init.body instanceof FormData ? Object.fromEntries([...init.body.keys()].map((k) => [k, true])) : JSON.parse(String(init.body));
    calls.push({ name, body });
    const r = replies[name]?.shift() ?? { status: 500, body: { error: "unexpected" } };
    if (r === "throw") throw new TypeError("offline");
    return new Response(JSON.stringify(r.body), { status: r.status });
  }));
}

beforeEach(() => {
  calls = [];
  vi.stubEnv("VITE_SUPABASE_URL", "https://x.supabase.co");
  vi.stubEnv("VITE_SUPABASE_ANON_KEY", "anon");
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

const ok = { status: 200, body: { saved: true } };
const blob = () => new Blob(["x"], { type: "audio/webm" });

describe("saveCase", () => {
  it("saves once when there is no audio", async () => {
    serve({ save_case: [ok] });
    const r = await saveCase(interview("yes"), new Map());
    expect(r).toMatchObject({ ok: true, audioSaved: 0 });
    expect(calls.map((c) => c.name)).toEqual(["save_case"]);
  });

  it("with consent: save, upload, then save again with the private path", async () => {
    serve({ save_case: [ok, ok], save_audio: [{ status: 200, body: { path: "case-audio/NS-1/1-main_problem.webm" } }] });
    const r = await saveCase(interview("yes"), new Map([[1, blob()]]));
    expect(calls.map((c) => c.name)).toEqual(["save_case", "save_audio", "save_case"]);
    expect(r.ok && r.record.answers[1].audio_url).toBe("case-audio/NS-1/1-main_problem.webm");
    expect((calls[2].body as { record: CaseRecord }).record.answers[1].audio_url).toBe("case-audio/NS-1/1-main_problem.webm");
  });

  it("without consent: never uploads audio", async () => {
    serve({ save_case: [ok] });
    const r = await saveCase(interview("no"), new Map([[1, blob()]]));
    expect(r).toMatchObject({ ok: true, audioSaved: 0 });
    expect(calls.map((c) => c.name)).toEqual(["save_case"]);
  });

  it("reports a failed case save as not saved", async () => {
    serve({ save_case: [{ status: 409, body: { error: "danger_sign_removed" } }] });
    expect(await saveCase(interview("yes"), new Map())).toMatchObject({ ok: false, reason: "danger_sign_removed", caseSaved: false });
    serve({ save_case: ["throw"] });
    expect(await saveCase(interview("yes"), new Map())).toMatchObject({ ok: false, reason: "network", caseSaved: false });
  });

  it("reports an audio or second-save failure, never success", async () => {
    serve({ save_case: [ok], save_audio: [{ status: 403, body: { error: "no_consent" } }] });
    expect(await saveCase(interview("yes"), new Map([[1, blob()]]))).toMatchObject({ ok: false, reason: "audio_no_consent", caseSaved: true });
    serve({ save_case: [ok, { status: 502, body: { error: "db_error" } }], save_audio: [{ status: 200, body: { path: "case-audio/p" } }] });
    expect(await saveCase(interview("yes"), new Map([[1, blob()]]))).toMatchObject({ ok: false, reason: "paths_db_error", caseSaved: true });
  });

  it("does not re-upload audio already stored", async () => {
    const r = interview("yes");
    r.answers[1].audio_url = "case-audio/already";
    serve({ save_case: [ok] });
    expect(await saveCase(r, new Map([[1, blob()]]))).toMatchObject({ ok: true, audioSaved: 0 });
    expect(calls.map((c) => c.name)).toEqual(["save_case"]);
  });
});
