// Per-phone settings from the one-time calibration, kept in this browser's
// local storage (a device setting, not customer data). Storage can be
// unavailable (private mode), so every access is guarded.

export interface Calibration {
  pxPerMm: number | null; // screen: CSS pixels per millimetre (from an ATM card)
  focalRatio: number | null; // front camera: focal length / frame width (from a 40 cm hold)
}

const KEY = "netrasaathi.calibration.v1";

export function loadCalibration(): Calibration {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const c = JSON.parse(raw);
      return { pxPerMm: typeof c.pxPerMm === "number" ? c.pxPerMm : null, focalRatio: typeof c.focalRatio === "number" ? c.focalRatio : null };
    }
  } catch { /* storage unavailable: calibrate again */ }
  return { pxPerMm: null, focalRatio: null };
}

export function saveCalibration(c: Calibration): void {
  try { localStorage.setItem(KEY, JSON.stringify(c)); } catch { /* keeps working for this session only */ }
}
