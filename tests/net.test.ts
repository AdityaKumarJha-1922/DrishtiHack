import { afterEach, describe, expect, it, vi } from "vitest";
import { callFunction, functionsConfig } from "../src/services/net";

const config = { url: "https://x.supabase.co/functions/v1", anonKey: "anon" };

afterEach(() => vi.unstubAllGlobals());

describe("functionsConfig", () => {
  it("needs both public values and builds the functions URL", () => {
    expect(functionsConfig({})).toBeNull();
    expect(functionsConfig({ VITE_SUPABASE_URL: "https://x.supabase.co/", VITE_SUPABASE_ANON_KEY: "k" }))
      .toEqual({ url: "https://x.supabase.co/functions/v1", anonKey: "k" });
  });
});

describe("callFunction failures become reasons, never exceptions", () => {
  it("not configured", async () => {
    expect(await callFunction("tts", { text: "x" }, 1000, null)).toEqual({ ok: false, reason: "not_configured" });
  });

  it("passes through the function's error code", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ error: "model_unavailable" }), { status: 502 })));
    expect(await callFunction("understand", {}, 1000, config)).toEqual({ ok: false, reason: "model_unavailable" });
  });

  it("bad JSON from the server", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("<html>", { status: 200 })));
    expect(await callFunction("understand", {}, 1000, config)).toEqual({ ok: false, reason: "bad_json" });
  });

  it("network error", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("failed"); }));
    expect(await callFunction("stt", {}, 1000, config)).toEqual({ ok: false, reason: "network" });
  });

  it("timeout", async () => {
    vi.stubGlobal("fetch", vi.fn((_u: string, init: RequestInit) => new Promise((_res, rej) => {
      init.signal?.addEventListener("abort", () => rej(new DOMException("aborted", "AbortError")));
    })));
    expect(await callFunction("tts", { text: "x" }, 20, config)).toEqual({ ok: false, reason: "timeout" });
  });

  it("sends the anon key, never a provider key", async () => {
    const f = vi.fn(async () => new Response(JSON.stringify({ transcript: "haan" }), { status: 200 }));
    vi.stubGlobal("fetch", f);
    const r = await callFunction("stt", { a: 1 }, 1000, config);
    expect(r).toEqual({ ok: true, data: { transcript: "haan" } });
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://x.supabase.co/functions/v1/stt");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer anon");
  });
});
