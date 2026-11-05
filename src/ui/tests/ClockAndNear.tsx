// The clock dial question, and the two near tests (near point and working
// distance) measured with the front camera, or typed in from a tape.
import { useEffect, useRef, useState } from "react";
import { distanceCm, optotypeHeightMm, steadyReading, t, RULES, type Script } from "../../brain";
import { startIrisCamera, type CameraStatus, type IrisCamera } from "./camera";
import { TumblingE } from "./ChartTest";

export function ClockDial({ onResult, script }: { onResult: (even: boolean) => void; script: Script }) {
  const n = RULES.phone_tests.clock_dial.lines;
  return (
    <div className="question">
      <svg viewBox="-110 -110 220 220" className="clock" role="img" aria-label="Clock dial">
        {/* Lines through the centre every 180/n degrees, all the same thickness. */}
        {Array.from({ length: n }, (_, i) => {
          const a = (i * Math.PI) / n;
          return <line key={i} x1={-100 * Math.cos(a)} y1={-100 * Math.sin(a)} x2={100 * Math.cos(a)} y2={100 * Math.sin(a)} stroke="#000" strokeWidth="4" />;
        })}
      </svg>
      <h1>{t("clock_ask", script)}</h1>
      <div className="options two">
        <button className="choice" onClick={() => onResult(false)}>{t("yes", script)}</button>
        <button className="choice" onClick={() => onResult(true)}>{t("no", script)}</button>
      </div>
    </div>
  );
}

interface NearProps {
  step: "near_point" | "working_distance";
  pxPerMm: number;
  focalRatio: number | null; // null: no camera calibration, type the distance
  onResult: (cm: number) => void;
  script: Script;
}

export function NearTest({ step, pxPerMm, focalRatio, onResult, script }: NearProps) {
  const near = RULES.phone_tests.near;
  const cam = RULES.phone_tests.camera;
  const video = useRef<HTMLVideoElement>(null);
  const camera = useRef<IrisCamera | null>(null);
  const [status, setStatus] = useState<CameraStatus>(focalRatio ? "starting" : "unavailable");
  const [manual, setManual] = useState(!focalRatio);
  const [typed, setTyped] = useState("");
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    if (!focalRatio) return;
    let alive = true;
    void startIrisCamera(video.current!, (s) => alive && setStatus(s)).then((c) => {
      camera.current = c;
      if (!c && alive) setManual(true); // no camera on this phone: type it instead
    });
    return () => { alive = false; camera.current?.stop(); };
  }, [focalRatio]);

  async function measure() {
    setNote("Hold still…");
    const r = await camera.current?.read();
    const cm = r && focalRatio ? steadyReading(r.samplesPx.map((px) => distanceCm(px, r.frameW, focalRatio))) : null;
    if (cm === null) { setNote("Could not measure. Face the camera in good light, or type the distance."); return; }
    onResult(cm);
  }

  const letterPx = optotypeHeightMm(near.target_snellen, near.target_at_cm / 100) * pxPerMm;
  return (
    <div className="question">
      <h1>{t(step === "near_point" ? "near_point" : "working_distance", script)}</h1>
      {step === "near_point" && (
        <div className="near-target" aria-label={t("small_letters_label", script)}>
          {[0, 90, 180, 270, 90, 0].map((r, i) => <TumblingE key={i} size={letterPx} rotate={r} />)}
        </div>
      )}
      {!manual && <video ref={video} className="preview small" playsInline muted />}
      <div className="sk-inline">
        {!manual ? (
          <>
            <p className="muted">Camera: {status === "ready" ? "face found" : status === "no_face" ? "looking for a face…" : status}</p>
            <button className="go" onClick={measure} disabled={status !== "ready"}>
              {step === "near_point" ? "It went blurry here" : "This is the working distance"}
            </button>
            <button className="ghost-light" onClick={() => setManual(true)}>Type the distance instead</button>
          </>
        ) : (
          <>
            <p>Measure eye-to-phone with a tape and type it ({cam.min_cm}–{cam.max_cm} cm):</p>
            <input inputMode="numeric" className="cm-input" value={typed} onChange={(e) => setTyped(e.target.value.replace(/\D/g, "").slice(0, 3))} aria-label="Distance in cm" />
            <button className="go" disabled={!typed} onClick={() => onResult(Number(typed))}>Save {typed || "…"} cm</button>
          </>
        )}
        {note && <p>{note}</p>}
      </div>
    </div>
  );
}
