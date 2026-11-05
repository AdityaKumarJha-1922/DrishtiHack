// The tumbling-E chart at 3 m for one eye (or the pinhole re-test). The helper
// taps the direction the customer says or points; a spoken direction can be
// read locally too. The procedure itself is the brain's (startChart/answerChart).
import { useRef, useState } from "react";
import {
  answerChart, chartResult, optotypeHeightMm, parseDirection, startChart, t, RULES,
  type ChartState, type Direction, type Script,
} from "../../brain";
import { startListening, voiceRoute, type Listening } from "../../services/stt";

type Step = "distance_right" | "distance_left" | "pinhole";
interface Props {
  step: Step;
  pxPerMm: number;
  voiceAllowed: boolean;
  onResult: (snellen: string, quality: { distance_ok: boolean; eye_covered: boolean }) => void;
  script: Script;
}

const ROTATE: Record<Direction, number> = { right: 0, down: 90, left: 180, up: 270 };
// Keys into customer_text.yaml.
const INSTRUCTION: Record<Step, string> = {
  distance_right: "chart_right_eye",
  distance_left: "chart_left_eye",
  pinhole: "chart_pinhole",
};
const HELPER: Record<Step, string> = {
  distance_right: "Right eye. The customer covers the LEFT eye.",
  distance_left: "Left eye. The customer covers the RIGHT eye.",
  pinhole: "Pinhole: the customer looks through a pin-prick in a card with the worse eye, the other eye covered.",
};

export default function ChartTest({ step, pxPerMm, voiceAllowed, onResult, script }: Props) {
  const chart = RULES.phone_tests.distance_chart;
  const [ready, setReady] = useState({ distance_ok: false, eye_covered: false });
  const [started, setStarted] = useState(false);
  const [state, setState] = useState<ChartState>(() => startChart());
  const [note, setNote] = useState<string | null>(null);
  const [listening, setListening] = useState(false);
  const rec = useRef<Listening | null>(null);
  const route = voiceAllowed ? voiceRoute() : null;

  function answer(a: Direction | "cant_see") {
    const next = answerChart(state, a);
    setNote(null);
    if (next.done) onResult(chartResult(next), { distance_ok: true, eye_covered: true });
    else setState(next);
  }

  async function listen() {
    if (listening) { rec.current?.stop(); return; }
    if (!route) return;
    const started = await startListening(route);
    if (!started.ok) { setNote("Voice not available: tap the direction."); return; }
    rec.current = started.data;
    setListening(true);
    setNote("Listening… tap Stop when the customer has answered.");
    const heard = await started.data.result;
    rec.current = null;
    setListening(false);
    const dir = heard.ok ? parseDirection(heard.data.transcript) : null;
    if (dir) answer(dir);
    else setNote(`Not clear${heard.ok ? ` ("${heard.data.transcript}")` : ""}: tap the direction.`);
  }

  if (!started) {
    return (
      <div className="test-setup">
        <p className="big-hi">{t(INSTRUCTION[step], script)}</p>
        <div className="sk-inline">
          <p>{HELPER[step]}</p>
          <label><input type="checkbox" checked={ready.distance_ok} onChange={(e) => setReady({ ...ready, distance_ok: e.target.checked })} /> The customer stands at the {chart.distance_m} m mark</label>
          <label><input type="checkbox" checked={ready.eye_covered} onChange={(e) => setReady({ ...ready, eye_covered: e.target.checked })} /> The other eye is covered</label>
          <button className="go" disabled={!ready.distance_ok || !ready.eye_covered} onClick={() => setStarted(true)}>Start chart</button>
        </div>
      </div>
    );
  }

  const line = RULES.snellen_lines[state.lineIndex];
  const sizePx = optotypeHeightMm(line, chart.distance_m) * pxPerMm;
  return (
    <div className="chart">
      <div className="e-area" aria-label="Tumbling E">
        <TumblingE size={sizePx} rotate={ROTATE[state.current]} />
      </div>
      <p className="hint">{t("chart_ask", script)}</p>
      <div className="sk-inline">
        <p className="muted">Line {line} · letter {state.shown + 1} of up to {chart.letters_per_line}</p>
        <div className="dir-pad">
          <span />
          <button onClick={() => answer("up")} aria-label="up">↑</button>
          <span />
          <button onClick={() => answer("left")} aria-label="left">←</button>
          <button className="cant" onClick={() => answer("cant_see")}>Can't see</button>
          <button onClick={() => answer("right")} aria-label="right">→</button>
          <span />
          <button onClick={() => answer("down")} aria-label="down">↓</button>
          <span />
        </div>
        {route && <button className="ghost-light" onClick={listen}>{listening ? "⏹ Stop" : "🎤 Listen for the answer"}</button>}
        {note && <p>{note}</p>}
      </div>
    </div>
  );
}

// A tumbling E: 5 units tall, strokes 1 unit thick, legs pointing right before rotation.
export function TumblingE({ size, rotate }: { size: number; rotate: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 5 5" style={{ transform: `rotate(${rotate}deg)` }} role="img" aria-hidden="true">
      <path d="M0 0H5V1H1V2H5V3H1V4H5V5H0Z" fill="#000" />
    </svg>
  );
}
