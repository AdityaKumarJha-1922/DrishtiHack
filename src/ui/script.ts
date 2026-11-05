// The customer's script choice (Devanagari or Roman Hindi), remembered on this
// phone as a convenience. Storage may be unavailable (private mode): then the
// default from customer_text.yaml is used.
import { DEFAULT_SCRIPT, type Script } from "../brain";

const KEY = "netrasaathi.script.v1";

export function loadScript(): Script {
  try {
    const s = localStorage.getItem(KEY);
    if (s === "latn" || s === "deva") return s;
  } catch { /* fall back to the default */ }
  return DEFAULT_SCRIPT;
}

export function saveScript(s: Script): void {
  try { localStorage.setItem(KEY, s); } catch { /* works for this session only */ }
}
