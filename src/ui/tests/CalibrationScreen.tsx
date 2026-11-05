// Once per phone (shopkeeper): screen size from an ATM card, then optionally
// the front camera from a tape-measured 40 cm hold. Without the camera step,
// near distances are typed in by hand.
import { useEffect, useRef, useState } from "react";
import { focalRatio, RULES } from "../../brain";
import { startIrisCamera, type CameraStatus, type IrisCamera } from "./camera";
import type { Calibration } from "./calibration";

export default function CalibrationScreen({ initial, onDone }: { initial: Calibration; onDone: (c: Calibration) => void }) {
  const card = RULES.phone_tests.id1_card_mm;
  // Start from the CSS standard (96 px per inch); the shopkeeper adjusts.
  const [cardPx, setCardPx] = useState(initial.pxPerMm ? initial.pxPerMm * card.width : (card.width * 96) / 25.4);
  const [step, setStep] = useState<"screen" | "camera">("screen");
  const pxPerMm = cardPx / card.width;

  if (step === "screen") {
    return (
      <div className="sk-panel-screen">
        <h2>Phone setup 1 of 2: screen size</h2>
        <p>Hold an ATM / RuPay card flat on the screen. Move the slider until the blue box is exactly as wide as the card.</p>
        <div className="card-box" style={{ width: cardPx, height: cardPx * (card.height / card.width) }} />
        <input type="range" min={150} max={900} step={1} value={cardPx} onChange={(e) => setCardPx(Number(e.target.value))}
          aria-label="Card width" className="slider" />
        <div className="sk-buttons">
          <button onClick={() => setCardPx(cardPx - 1)}>− 1</button>
          <button onClick={() => setCardPx(cardPx + 1)}>+ 1</button>
        </div>
        <button className="go" onClick={() => setStep("camera")}>Card matches: next</button>
      </div>
    );
  }
  return <CameraCalibration onDone={(ratio) => onDone({ pxPerMm, focalRatio: ratio ?? initial.focalRatio })} />;
}

function CameraCalibration({ onDone }: { onDone: (ratio: number | null) => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const cam = useRef<IrisCamera | null>(null);
  const [status, setStatus] = useState<CameraStatus>("starting");
  const [note, setNote] = useState<string | null>(null);
  const cm = RULES.phone_tests.camera.calibration_distance_cm;

  // useEffect with [] runs once when the screen opens; the function it returns
  // runs when it closes (like a `with` block that releases the camera).
  useEffect(() => {
    let alive = true;
    void startIrisCamera(video.current!, (s) => alive && setStatus(s)).then((c) => { cam.current = c; });
    return () => { alive = false; cam.current?.stop(); };
  }, []);

  async function measure() {
    setNote("Hold still…");
    const r = await cam.current?.read();
    if (!r) { setNote("No face found. Face the camera in good light and try again."); return; }
    const sorted = [...r.samplesPx].sort((a, b) => a - b);
    onDone(focalRatio(sorted[Math.floor(sorted.length / 2)], r.frameW));
  }

  return (
    <div className="sk-panel-screen">
      <h2>Phone setup 2 of 2: camera (optional)</h2>
      <p>Use a measuring tape: hold the phone exactly {cm} cm from your eyes, look at the screen, then press Measure.</p>
      <video ref={video} className="preview" playsInline muted />
      <p className="muted">Camera: {status === "ready" ? "face found" : status === "no_face" ? "looking for a face…" : status}</p>
      {note && <p>{note}</p>}
      <button className="go" onClick={measure} disabled={status !== "ready"}>Measure at {cm} cm</button>
      <button className="ghost-light" onClick={() => onDone(null)}>Skip: type near distances by hand</button>
    </div>
  );
}
