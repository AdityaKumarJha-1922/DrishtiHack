// The interview screen: the customer interview (top) and the shopkeeper panel (bottom).
//
// React note for Python readers: a component is a function that returns what
// to draw. `useState` keeps a value between redraws, like an attribute on an
// object; calling its setter redraws the screen with the new value.
import { useState } from "react";
import {
  applyAnswer, createCase, isStopped, nextQuestion, progress, undoLast, voiceAction, RULES,
  type AnswerMeta, type AnswerValue, type CaseRecord, type Understanding,
} from "../brain";
import QuestionScreen from "./QuestionScreen";

const SHOP_ID = "shop-01"; // set per shop later

function newCase(): CaseRecord {
  return createCase({ case_id: `NS-${Date.now().toString(36).toUpperCase()}`, shop_id: SHOP_ID });
}

export default function App() {
  const [record, setRecord] = useState<CaseRecord>(newCase);
  // The current selection lives here so both the customer's "Aage" button and
  // the shopkeeper's "Next" submit the same thing.
  const [pending, setPending] = useState<AnswerValue | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showJson, setShowJson] = useState(false);
  // What voice understanding last produced, shown to the shopkeeper. Its
  // transcript and confidence are saved only if the customer keeps that answer.
  const [voice, setVoice] = useState<{ u: Understanding; transcript: string | null } | null>(null);
  // True while the customer is being asked to confirm a read-back.
  const [readbackActive, setReadbackActive] = useState(false);

  const question = nextQuestion(record);
  const stopped = isStopped(record);
  const { answered, atMost } = progress(record);

  // Every answer goes through the brain; a rejected answer changes nothing.
  function commit(value: AnswerValue, meta: AnswerMeta) {
    if (!question) return;
    const result = applyAnswer(record, question.id, value, meta);
    if (result.ok) {
      setRecord(result.record);
      setPending(null);
      setError(null);
      setVoice(null);
      setReadbackActive(false);
    } else {
      setError(result.error);
    }
  }

  // "Aage" or the shopkeeper's "Next". Voice details are kept only when the
  // customer confirms the exact option voice pre-selected; anything else is a tap.
  function submit() {
    if (!question || pending === null || readbackActive) return;
    const u = voice?.u;
    const keptVoice = u?.kind === "answer" && voiceAction(question, u) === "preselect"
      && JSON.stringify(u.value) === JSON.stringify(pending);
    const meta: AnswerMeta = keptVoice && u?.kind === "answer"
      ? { transcript: voice!.transcript, confidence: u.confidence, confirmed: true }
      : {}; // a tap answer
    commit(pending, meta);
  }

  function redo() {
    const result = undoLast(record);
    if (result.ok) {
      setRecord(result.record);
      setPending(null);
      setError(null);
      setVoice(null);
      setReadbackActive(false);
    } else {
      setError(result.error);
    }
  }

  function startOver() {
    if (window.confirm("Start a new case? The current one is not saved yet.")) {
      setRecord(newCase());
      setPending(null);
      setError(null);
      setVoice(null);
      setReadbackActive(false);
    }
  }

  return (
    <div className="app">
      <main className={`customer ${stopped ? "is-red" : ""}`} aria-live="polite">
        {stopped ? (
          <div className="end-screen red">
            <p className="big">{RULES.messages.red_customer_hi}</p>
          </div>
        ) : question ? (
          <>
            <div className="progress" aria-label={`Sawal ${answered + 1}, zyada se zyada ${atMost}`}>
              <span>Sawal {answered + 1}</span>
              <span className="muted">zyada se zyada {atMost}</span>
              <div className="bar"><div style={{ width: `${(answered / atMost) * 100}%` }} /></div>
            </div>
            {/* `key` makes React start a fresh screen for each question. */}
            <QuestionScreen
              key={question.id}
              question={question}
              value={pending}
              onChange={(v) => { setPending(v); setError(null); }}
              onSubmit={submit}
              voiceAllowed={record.consent.given === true}
              onVoice={(u, transcript) => setVoice({ u, transcript })}
              onApplyNow={commit}
              onReadbackChange={setReadbackActive}
            />
            {error && <p className="retry" role="alert">Kripya dobara chuniye.</p>}
          </>
        ) : (
          <div className="end-screen">
            <p className="big">{RULES.messages.done_customer_hi}</p>
          </div>
        )}
      </main>

      <section className="shopkeeper" aria-label="Shopkeeper controls">
        <div className="sk-head">
          <strong>Shopkeeper</strong>
          <span className="muted">Case {record.case_id}</span>
        </div>

        {stopped && <p className="sk-alert">{RULES.messages.red_shopkeeper_en}</p>}
        {!stopped && !question && (
          <p className="sk-note">
            Interview complete. Tests come next (M2). Nothing here is final until the remote optometrist reviews the case.
          </p>
        )}
        {error && <p className="sk-error">Not accepted: {error}</p>}
        {voice && <VoicePanel u={voice.u} transcript={voice.transcript} />}
        {readbackActive && <p className="sk-note">Read-back: waiting for the customer to say or tap Haan / Nahin.</p>}

        <div className="sk-buttons">
          <button onClick={submit} disabled={!question || pending === null || readbackActive}>Next</button>
          <button onClick={redo} disabled={stopped || record.answers.length === 0}>Redo</button>
          <button disabled title="Needs an audit field in the case record: decision pending">Override</button>
        </div>
        <div className="sk-buttons">
          <button className="ghost" onClick={() => setShowJson(!showJson)}>{showJson ? "Hide" : "Show"} case record</button>
          <button className="ghost" onClick={startOver}>New case</button>
        </div>
        {showJson && <pre className="json">{JSON.stringify(record, null, 2)}</pre>}
      </section>
    </div>
  );
}

// Shopkeeper view of the last voice attempt. Raw transcripts are shown here
// for checking, never logged or sent anywhere else.
function VoicePanel({ u, transcript }: { u: Understanding; transcript: string | null }) {
  return (
    <div className="sk-voice">
      {u.dangerWordsHeard.length > 0 && (
        <p className="sk-alert">
          Possible danger words heard: {u.dangerWordsHeard.join(", ")}. Check with the customer now. If they have this
          now, stop and refer to an eye doctor today.
        </p>
      )}
      {transcript && <p>Heard: “{transcript}”</p>}
      {u.kind === "answer" && (
        <p>
          Voice answer, confidence {u.confidence.toFixed(2)}
          {u.confidence < RULES.speech.readback_below_confidence ? " (low)" : ""}. Saved only after the customer
          confirms; a danger answer is saved at once.
        </p>
      )}
      {u.kind === "unclear" && <p>Voice answer unclear. Customer should tap.</p>}
      {u.kind === "rejected" && <p>Voice not used ({u.reason}). Customer should tap.</p>}
    </div>
  );
}
