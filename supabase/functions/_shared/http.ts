// Shared helpers for the Edge Functions (Deno runtime).
// Rule: never log audio, transcripts, or any customer detail. Log only error kinds.

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

/** A uniform error reply: { error: <short code> }. The client falls back to taps. */
export function fail(code: string, status: number): Response {
  console.error(`error: ${code}`);
  return json({ error: code }, status);
}

/** Reads a secret set with `supabase secrets set`. Returns null when missing. */
export function secret(name: string): string | null {
  const v = Deno.env.get(name);
  return v && v.trim() ? v.trim() : null;
}

/** fetch with a hard timeout. Throws "timeout" when it runs out. */
export async function fetchWithTimeout(url: string, init: RequestInit, ms: number): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (e) {
    if (controller.signal.aborted) throw new Error("timeout");
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

/** Handles CORS preflight and rejects anything but POST. Returns a Response to send, or null to continue. */
export function preflight(req: Request): Response | null {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return fail("method_not_allowed", 405);
  return null;
}
