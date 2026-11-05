// One question per screen, with large tap answers, a repeat button, and
// (after consent) a microphone button. The words come from the data files in
// the customer's chosen script (Devanagari or Roman Hindi); spoken text always
// uses SPEAK_SCRIPT. What happens to a voice answer is decided by the brain
// (voiceAction), never here.
import { useRef, useState } from "react";
import {
  optionLabel, parseYesNo, questionText, readbackText, t, voiceAction, RULES, SPEAK_SCRIPT,
  type AnswerMeta, type AnswerValue, type Question, type Script, type Understanding,
} from "../brain";
import type { CallResult } from "../services/net";
import { startListening, voiceRoute, type Listening } from "../services/stt";
import { speak } from "../services/tts";
import { understand } from "../services/understand";

interface Props {
  question: Question;
  value: AnswerValue | null;
  onChange: (v: AnswerValue | null) => void;
  onSubmit: () => void;
  voiceAllowed: boolean; // only after the customer said yes to recording
  // `audio` is the recording behind a voice answer (kept only until the case is saved).
  onVoice: (u: Understanding, transcript: string | null, audio?: Blob) => void;
  // Saves an answer straight away (a confirmed read-back, or a danger answer).
  onApplyNow: (value: AnswerValue, meta: AnswerMeta, audio?: Blob) => void;
  onReadbackChange: (active: boolean) => void;
  script: Script;
}

type VoiceState = "idle" | "listening" | "working";
interface Readback { value: AnswerValue; transcript: string; confidence: number; audio?: Blob }

export default function QuestionScreen(props: Props) {
  const { question, value, onChange, onSubmit, voiceAllowed, onVoice, onApplyNow, onReadbackChange, script } = props;
  const [flash, setFlash] = useState(false);
  const [voiceState, setVoiceState] = useState<VoiceState>("idle");
  // A key into customer_text.yaml, so the note follows a script switch.
  const [voiceNote, setVoiceNote] = useState<string | null>(null);
  const [readback, setReadbackState] = useState<Readback | null>(null);
  const [rejections, setRejections] = useState(0);
  // useRef keeps a value between redraws without causing one (like a plain attribute).
  const listening = useRef<Listening | null>(null);

  const voiceOff = rejections >= RULES.speech.max_readback_rejections;
  const route = voiceAllowed && !voiceOff ? voiceRoute() : null;

  function setReadback(r: Readback | null) {
    setReadbackState(r);
    onReadbackChange(r !== null);
  }

  // Speak (always in SPEAK_SCRIPT): Sarvam voice, then the phone's Hindi voice,
  // else highlight the text on screen so the shopkeeper can read it out.
  async function say(spoken: string) {
    if (!(await speak(spoken))) {
      setFlash(true);
      window.setTimeout(() => setFlash(false), 1200);
    }
  }

  // Records once and returns the transcript (or why there is none).
  async function listenOnce(): Promise<CallResult<{ transcript: string; audio?: Blob }>> {
    if (!route) return { ok: false, reason: "no_voice_route" };
    const started = await startListening(route);
    if (!started.ok) return started;
    listening.current = started.data;
    setVoiceState("listening");
    const heard = await started.data.result;
    listening.current = null;
    setVoiceState("idle");
    return heard;
  }

  async function micPressed() {
    if (voiceState === "listening") {
      listening.current?.stop();
      return;
    }
    if (voiceState !== "idle") return;
    setVoiceNote(null);
    if (readback) return confirmByVoice();

    const heard = await listenOnce();
    if (!heard.ok) {
      setVoiceNote("please_tap");
      onVoice({ kind: "rejected", reason: heard.reason, dangerWordsHeard: [] }, null);
      return;
    }
    setVoiceState("working");
    const u = await understand(question, heard.data.transcript);
    setVoiceState("idle");
    const audio = heard.data.audio;
    onVoice(u, heard.data.transcript, audio);

    const action = voiceAction(question, u);
    if (u.kind !== "answer" || action === "taps") {
      setVoiceNote("please_tap");
    } else if (action === "apply_now") {
      // A danger answer: saved at once, not read back, so nothing can undo it.
      onApplyNow(u.value, { transcript: heard.data.transcript, confidence: u.confidence, confirmed: false }, audio);
    } else if (action === "read_back") {
      onChange(u.value);
      setReadback({ value: u.value, transcript: heard.data.transcript, confidence: u.confidence, audio });
      void say(readbackText(question, u.value, SPEAK_SCRIPT));
    } else {
      onChange(u.value); // a pre-selection only: the customer still taps "Aage"
      setVoiceNote("confirm_preselect");
    }
  }

  // The customer says "haan" or "nahin" to the read-back; read locally, no LLM.
  async function confirmByVoice() {
    const heard = await listenOnce();
    const answer = heard.ok ? parseYesNo(heard.data.transcript) : null;
    if (answer === "yes") confirmYes();
    else if (answer === "no") confirmNo();
    else setVoiceNote("readback_unclear");
  }

  function confirmYes() {
    if (!readback) return;
    const r = readback;
    setReadback(null);
    onApplyNow(r.value, { transcript: r.transcript, confidence: r.confidence, confirmed: true }, r.audio);
  }

  function confirmNo() {
    setReadback(null);
    onChange(null);
    const n = rejections + 1;
    setRejections(n);
    setVoiceNote(n >= RULES.speech.max_readback_rejections ? "please_tap_short" : "readback_no_retry");
  }

  const micButton = route && (
    <button
      className={`mic ${voiceState}`}
      onClick={micPressed}
      disabled={voiceState === "working"}
      aria-label={t(voiceState === "listening" ? "stop_label" : "speak_label", script)}
    >
      {voiceState === "listening" ? t("stop", script) : voiceState === "working" ? "…" : t("speak", script)}
    </button>
  );

  if (readback) {
    return (
      <div className="question">
        <p className="asked">{questionText(question, script)}</p>
        <h1 className={flash ? "flash" : ""}>{readbackText(question, readback.value, script)}</h1>
        <div className="row">
          <button className="repeat" onClick={() => say(readbackText(question, readback.value, SPEAK_SCRIPT))}
            aria-label={t("repeat_label", script)}>{t("repeat", script)}</button>
          {micButton}
        </div>
        {voiceState === "listening" && <p className="voice-note">{t("listening_yes_no", script)}</p>}
        {voiceNote && voiceState === "idle" && <p className="voice-note">{t(voiceNote, script)}</p>}
        <div className="options two">
          <button className="choice confirm-yes" onClick={confirmYes}>{t("yes", script)}</button>
          <button className="choice confirm-no" onClick={confirmNo}>{t("no", script)}</button>
        </div>
      </div>
    );
  }

  return (
    <div className="question">
      <h1 className={flash ? "flash" : ""}>{questionText(question, script)}</h1>
      <div className="row">
        <button className="repeat" onClick={() => say(questionText(question, SPEAK_SCRIPT))}
          aria-label={t("repeat_label", script)}>{t("repeat", script)}</button>
        {micButton}
      </div>
      {voiceState === "listening" && <p className="voice-note">{t("listening", script)}</p>}
      {voiceNote && voiceState === "idle" && <p className="voice-note">{t(voiceNote, script)}</p>}

      <Answers question={question} value={value} onChange={onChange} script={script} />

      <button className="go" onClick={onSubmit} disabled={value === null}>{t("next", script)}</button>
    </div>
  );
}

function Answers({ question, value, onChange, script }: Pick<Props, "question" | "value" | "onChange" | "script">) {
  if (question.type === "yes_no") {
    return (
      <div className="options two">
        <Choice label={t("yes", script)} selected={value === "yes"} onClick={() => onChange("yes")} />
        <Choice label={t("no", script)} selected={value === "no"} onClick={() => onChange("no")} />
      </div>
    );
  }

  if (question.type === "choice") {
    return (
      <div className="options">
        {(question.options ?? []).map((o) => (
          <Choice key={String(o.value)} label={optionLabel(o, script)} selected={value === o.value} onClick={() => onChange(o.value)} />
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
        <p className="hint">{t("choose_many", script)}</p>
        {(question.options ?? []).map((o) => (
          <Choice key={String(o.value)} label={optionLabel(o, script)} selected={chosen.includes(String(o.value))} onClick={() => toggle(String(o.value))} />
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
      <button onClick={() => onChange(null)} aria-label={t("erase_label", script)}>⌫</button>
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
