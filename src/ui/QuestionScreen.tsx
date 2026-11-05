// One question per screen, with large tap answers and a repeat button.
// The options come straight from data/questions.yaml.
import { useState } from "react";
import type { AnswerValue, Question } from "../brain";
import { canSpeak, speakHindi } from "./speech";

interface Props {
  question: Question;
  value: AnswerValue | null;
  onChange: (v: AnswerValue | null) => void;
  onSubmit: () => void;
}

export default function QuestionScreen({ question, value, onChange, onSubmit }: Props) {
  const [flash, setFlash] = useState(false);

  // Repeat: speak the question if this phone has a Hindi voice; otherwise
  // highlight the text so the shopkeeper can read it out.
  function repeat() {
    if (!(canSpeak() && speakHindi(question.text_hi))) {
      setFlash(true);
      window.setTimeout(() => setFlash(false), 1200);
    }
  }

  return (
    <div className="question">
      <h1 className={flash ? "flash" : ""}>{question.text_hi}</h1>
      <button className="repeat" onClick={repeat} aria-label="Sawal dobara suniye">🔁 Dobara suniye</button>

      <Answers question={question} value={value} onChange={onChange} />

      <button className="go" onClick={onSubmit} disabled={value === null}>Aage →</button>
    </div>
  );
}

function Answers({ question, value, onChange }: Omit<Props, "onSubmit">) {
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
