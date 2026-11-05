// One question per screen, with large tap answers, a repeat button, and
// (after consent) a microphone button. The options come straight from
// data/questions.yaml.
import { useRef, useState } from "react";
import type { AnswerValue, Question, Understanding } from "../brain";
import { startListening, voiceRoute, type Listening } from "../services/stt";
import { speak } from "../services/tts";
import { understand } from "../services/understand";

interface Props {
  question: Question;
  value: AnswerValue | null;
  onChange: (v: AnswerValue | null) => void;
  onSubmit: () => void;
  voiceAllowed: boolean; // only after the customer said yes to recording
  onVoice: (u: Understanding, transcript: string | null) => void;
}

type VoiceState = "idle" | "listening" | "working";

export default function QuestionScreen({ question, value, onChange, onSubmit, voiceAllowed, onVoice }: Props) {
  const [flash, setFlash] = useState(false);
  const [voiceState, setVoiceState] = useState<VoiceState>("idle");
  const [voiceNote, setVoiceNote] = useState<string | null>(null);
  // useRef keeps a value between redraws without causing one (like a plain attribute).
  const listening = useRef<Listening | null>(null);

  const route = voiceAllowed ? voiceRoute() : null;

  // Repeat: Sarvam voice, then the phone's Hindi voice, else highlight the text.
  async function repeat() {
    if (!(await speak(question.text_hi))) {
      setFlash(true);
      window.setTimeout(() => setFlash(false), 1200);
    }
  }

  async function micPressed() {
    if (voiceState === "listening") {
      listening.current?.stop();
      return;
    }
    if (!route || voiceState !== "idle") return;
    setVoiceNote(null);
    const started = await startListening(route);
    if (!started.ok) {
      setVoiceNote("Awaaz nahin mil paayi. Kripya neeche se chuniye.");
      onVoice({ kind: "rejected", reason: started.reason, dangerWordsHeard: [] }, null);
      return;
    }
    listening.current = started.data;
    setVoiceState("listening");

    const heard = await started.data.result;
    listening.current = null;
    if (!heard.ok) {
      setVoiceState("idle");
      setVoiceNote("Samajh nahin aaya. Kripya neeche se chuniye.");
      onVoice({ kind: "rejected", reason: heard.reason, dangerWordsHeard: [] }, null);
      return;
    }

    setVoiceState("working");
    const u = await understand(question, heard.data.transcript);
    setVoiceState("idle");
    onVoice(u, heard.data.transcript);
    if (u.kind === "answer") {
      onChange(u.value); // a pre-selection only: the customer still taps "Aage"
      setVoiceNote("Kya yeh sahi hai? Sahi ho to Aage dabaiye.");
    } else {
      setVoiceNote("Samajh nahin aaya. Kripya neeche se chuniye.");
    }
  }

  return (
    <div className="question">
      <h1 className={flash ? "flash" : ""}>{question.text_hi}</h1>
      <div className="row">
        <button className="repeat" onClick={repeat} aria-label="Sawal dobara suniye">🔁 Dobara suniye</button>
        {route && (
          <button
            className={`mic ${voiceState}`}
            onClick={micPressed}
            disabled={voiceState === "working"}
            aria-label={voiceState === "listening" ? "Bolna band kijiye" : "Bolkar jawab dijiye"}
          >
            {voiceState === "listening" ? "⏹ Bas" : voiceState === "working" ? "…" : "🎤 Boliye"}
          </button>
        )}
      </div>
      {voiceState === "listening" && <p className="voice-note">Boliye… ho jaaye to "Bas" dabaiye.</p>}
      {voiceNote && voiceState === "idle" && <p className="voice-note">{voiceNote}</p>}

      <Answers question={question} value={value} onChange={onChange} />

      <button className="go" onClick={onSubmit} disabled={value === null}>Aage →</button>
    </div>
  );
}

function Answers({ question, value, onChange }: Pick<Props, "question" | "value" | "onChange">) {
  if (question.type === "yes_no") {
    return (
      <div className="options two">
        <Choice label="Haan" selected={value === "yes"} onClick={() => onChange("yes")} />
        <Choice label="Nahin" selected={value === "no"} onClick={() => onChange("no")} />
      </div>
    );
  }

  if (question.type === "choice") {
    return (
      <div className="options">
        {(question.options ?? []).map((o) => (
          <Choice key={String(o.value)} label={o.label_hi} selected={value === o.value} onClick={() => onChange(o.value)} />
        ))}
      </div>
    );
  }

  if (question.type === "multi") {
    const chosen = Array.isArray(value) ? value : [];
    // "None" can't be combined with other answers: picking it clears the rest, and vice versa.
    function toggle(v: string) {
      let next: string[];
      if (chosen.includes(v)) next = chosen.filter((c) => c !== v);
      else if (v === question.none_value) next = [v];
      else next = [...chosen.filter((c) => c !== question.none_value), v];
      onChange(next.length ? next : null);
    }
    return (
      <div className="options">
        <p className="hint">Ek ya zyada chuniye</p>
        {(question.options ?? []).map((o) => (
          <Choice key={String(o.value)} label={o.label_hi} selected={chosen.includes(String(o.value))} onClick={() => toggle(String(o.value))} />
        ))}
      </div>
    );
  }

  // number: a large keypad, so no phone keyboard pops up over the screen.
  const digits = typeof value === "number" ? String(value) : "";
  function press(d: string) {
    const next = (digits + d).slice(0, 3);
    onChange(next ? Number(next) : null);
  }
  return (
    <div className="keypad">
      <div className="display" aria-live="polite">{digits || "—"}</div>
      {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((d) => (
        <button key={d} onClick={() => press(d)}>{d}</button>
      ))}
      <button onClick={() => onChange(null)} aria-label="Mitaiye">⌫</button>
      <button onClick={() => press("0")}>0</button>
      <span />
    </div>
  );
}

function Choice({ label, selected, onClick }: { label: string; selected: boolean; onClick: () => void }) {
  return (
    <button className={`choice ${selected ? "selected" : ""}`} aria-pressed={selected} onClick={onClick}>
      {label}
    </button>
  );
}
