// Calls our Supabase Edge Functions. Every failure comes back as a short
// reason instead of an exception, so the UI can always fall back to taps.
//
// async/await note for Python readers: `async function` is like `async def`;
// `await fetch(...)` pauses until the network answers, without freezing the screen.

export type CallResult<T> = { ok: true; data: T } | { ok: false; reason: string };

export interface Env {
  VITE_SUPABASE_URL?: string;
  VITE_SUPABASE_ANON_KEY?: string;
}

/** Public settings only (URL + anon key). Provider keys never reach the app. */
export function functionsConfig(env: Env = import.meta.env as Env): { url: string; anonKey: string } | null {
  const url = env.VITE_SUPABASE_URL?.trim();
  const anonKey = env.VITE_SUPABASE_ANON_KEY?.trim();
  if (!url || !anonKey) return null;
  return { url: `${url.replace(/\/$/, "")}/functions/v1`, anonKey };
}

export function isOnline(): boolean {
  return typeof navigator === "undefined" || navigator.onLine !== false;
}

export async function callFunction<T>(
  name: "stt" | "tts" | "understand",
  body: BodyInit | object,
  timeoutMs: number,
  config = functionsConfig(),
): Promise<CallResult<T>> {
  if (!config) return { ok: false, reason: "not_configured" };
  if (!isOnline()) return { ok: false, reason: "offline" };

  const isForm = typeof FormData !== "undefined" && body instanceof FormData;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${config.url}/${name}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.anonKey}`,
        apikey: config.anonKey,
        ...(isForm ? {} : { "Content-Type": "application/json" }),
      },
      body: isForm ? (body as FormData) : JSON.stringify(body),
      signal: controller.signal,
    });
    let data: unknown;
    try {
      data = await res.json();
    } catch {
      return { ok: false, reason: "bad_json" };
    }
    if (!res.ok) {
      const code = (data as { error?: unknown })?.error;
      return { ok: false, reason: typeof code === "string" ? code : `http_${res.status}` };
    }
    return { ok: true, data: data as T };
  } catch {
    return { ok: false, reason: controller.signal.aborted ? "timeout" : "network" };
  } finally {
    clearTimeout(timer);
  }
}
