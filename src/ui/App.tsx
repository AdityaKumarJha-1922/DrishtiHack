// The interview screen: the customer interview (top) and the shopkeeper panel (bottom).
//
// React note for Python readers: a component is a function that returns what
// to draw. `useState` keeps a value between redraws, like an attribute on an
// object; calling its setter redraws the screen with the new value.
import { useEffect, useRef, useState } from "react";
import {
  applyAnswer, createCase, decide, isStopped, nextQuestion, nextTest, progress, reportDangerLater, reportableDangerSigns,
  isApproved, t, undoLast, voiceAction, RULES, SPEAK_SCRIPT,
  type AnswerMeta, type AnswerValue, type CaseRecord, type Script, type Understanding,
} from "../brain";
import QuestionScreen from "./QuestionScreen";
import { loadScript, saveScript } from "./script";
import { speak } from "../services/tts";
import { saveCase } from "../services/save";
import TestFlow from "./tests/TestFlow";
import { customerResultText, ShopkeeperResult } from "./tests/ResultCard";

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
  const [voice, setVoice] = useState<{ u: Understanding; transcript: string | null; audio?: Blob } | null>(null);
  // True while the customer is being asked to confirm a read-back.
  const [readbackActive, setReadbackActive] = useState(false);
  // Shopkeeper's "Report danger sign" picker.
  const [showReport, setShowReport] = useState(false);
  // Recordings behind voice answers, by answer index. Kept in memory only until
  // the case is saved; uploaded only with consent. useRef: no redraw needed.
  const audio = useRef(new Map<number, Blob>());
  // Saving (Step 5). `savedJson` is the record exactly as the server last confirmed it.
  const [savedJson, setSavedJson] = useState<string | null>(null);
  // "partial": the case record is on the server, but a voice recording is not.
  const [save, setSave] = useState<{ state: "idle" | "saving" | "saved" | "partial" | "failed"; reason?: string }>({ state: "idle" });
  const lastAttempt = useRef<string | null>(null);
  // Devanagari or Roman Hindi for everything the customer reads.
  const [script, setScript] = useState<Script>(loadScript);
  const otherScript: Script = script === "deva" ? "latn" : "deva";
  function switchScript() {
    setScript(otherScript);
    saveScript(otherScript);
  }

  const question = nextQuestion(record);
  const stopped = isStopped(record);
  const { answered, atMost } = progress(record);
  // After the interview come the phone tests (M2); the case is finished when
  // they are done (the record then carries decide()'s result) or it is Red.
  const testStep = !stopped && !question ? nextTest(record) : null;
  const finished = stopped || (!question && testStep === null);
  // Save points: a Red case, the end of the interview (before any test, so the
  // answers are kept if the customer leaves), and the end of the tests.
  const atSavePoint = finished || testStep === "distance_right";
  const recordJson = JSON.stringify(record);
  const isSaved = savedJson === recordJson;

  async function doSave() {
    const attempt = recordJson;
    lastAttempt.current = attempt;
    setSave({ state: "saving" });
    const result = await saveCase(record, audio.current);
    if (result.ok) {
      setRecord(result.record);
      setSavedJson(JSON.stringify(result.record));
      setSave({ state: "saved" });
    } else {
      if (result.caseSaved) setRecord(result.record); // keeps any audio paths already uploaded
      setSave({ state: result.caseSaved ? "partial" : "failed", reason: result.reason });
    }
  }

  // useEffect runs after a redraw when `recordJson` changed (like a callback on
  // "record changed"). It saves automatically at each save point, trying each
  // version of the record once; "Save again" retries by hand.
  useEffect(() => {
    if (atSavePoint && !isSaved && save.state !== "saving" && lastAttempt.current !== recordJson) void doSave();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recordJson]);

  // Every answer goes through the brain; a rejected answer changes nothing.
  function commit(value: AnswerValue, meta: AnswerMeta, recording?: Blob) {
    if (!question) return;
    const index = record.answers.length; // where this answer will sit
    const result = applyAnswer(record, question.id, value, meta);
    if (result.ok) {
      if (recording) audio.current.set(index, recording);
      // If this answer ends an interview whose tests are already done (after a
      // Redo), the brain decides again; otherwise the result would be missing.
      const r = result.record;
      setRecord(!isStopped(r) && !nextQuestion(r) && !nextTest(r) ? decide(r) : r);
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
    commit(pending, meta, keptVoice ? voice!.audio : undefined);
  }

  function redo() {
    const result = undoLast(record);
    if (result.ok) {
      for (const i of [...audio.current.keys()]) if (i >= result.record.answers.length) audio.current.delete(i);
      setRecord(result.record);
      setPending(null);
      setError(null);
      setVoice(null);
      setReadbackActive(false);
    } else {
      setError(result.error);
    }
  }

  // Escalation only: adds a danger sign; can never remove one.
  function reportDanger(code: string) {
    if (!window.confirm(`Mark this case RED (urgent) for: ${label(code)}? This cannot be undone.`)) return;
    const result = reportDangerLater(record, code);
    if (result.ok) {
      setRecord(result.record);
      setPending(null);
      setVoice(null);
      setReadbackActive(false);
      setShowReport(false);
      setError(null);
    } else {
      setError(result.error);
    }
  }

  // An unsaved Red case can't be dropped while a save is still possible: the
  // button stays disabled while saving, and only a failed save (or one where the
  // record is on the server but a recording is not) allows it, after a warning.
  // There is no offline queue yet.
  const newCaseBlocked = stopped && !isSaved && save.state !== "failed" && save.state !== "partial";

  function startOver() {
    if (newCaseBlocked) return;
    let warning: string | null = null;
    if (stopped && !isSaved && save.state === "partial") {
      warning = `This URGENT (Red) case is saved, but a voice recording is not (${save.reason}). Start a new case? The recording will be lost.`;
    } else if (stopped && !isSaved) {
      warning = `This URGENT (Red) case could NOT be saved (${save.reason}). Make sure the customer has been told to see an eye doctor today, and note the case on paper. Discard it and start a new case?`;
    } else if (!isSaved && save.state === "partial") {
      warning = `This case is saved, but a voice recording is not (${save.reason}). Start a new case? The recording will be lost.`;
    } else if (!isSaved && record.answers.length > 0) {
      warning = finished
        ? `This case is NOT saved (${save.reason ?? "not tried"}). Discard it?`
        : savedJson !== null
          ? "The interview is saved, but the test results so far are not. Start a new case?"
          : "Start a new case? This interview is not finished or saved.";
    }
    if (warning === null || window.confirm(warning)) {
      audio.current = new Map();
      setSavedJson(null);
      setSave({ state: "idle" });
      lastAttempt.current = null;
      setRecord(newCase());
      setPending(null);
      setError(null);
      setVoice(null);
      setReadbackActive(false);
      setShowReport(false);
    }
  }

  return (
    <div className="app">
      <main className={`customer ${stopped ? "is-red" : ""}`} aria-live="polite"
        data-script={script} lang={script === "deva" ? "hi" : "hi-Latn"}>
        <div className="script-row">
          <button className="script-switch" onClick={switchScript} lang={otherScript === "deva" ? "hi" : "hi-Latn"}>
            {otherScript === "deva" ? "अ" : "A"} {t("script_name", otherScript)}
          </button>
        </div>
        {stopped ? (
          <div className="end-screen red">
            <p className="big">{t("red_customer", script)}</p>
            <button className="repeat" onClick={() => speak(t("red_customer", SPEAK_SCRIPT))} aria-label={t("repeat_label", script)}>
              {t("repeat", script)}
            </button>
          </div>
        ) : question ? (
          <>
            <div className="progress"
              aria-label={`${t("progress_question", script, { n: answered + 1 })}, ${t("progress_at_most", script, { n: atMost })}`}>
              <span>{t("progress_question", script, { n: answered + 1 })}</span>
              <span className="muted">{t("progress_at_most", script, { n: atMost })}</span>
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
              onVoice={(u, transcript, recording) => setVoice({ u, transcript, audio: recording })}
              onApplyNow={commit}
              onReadbackChange={setReadbackActive}
              script={script}
            />
            {error && <p className="retry" role="alert">{t("please_choose_again", script)}</p>}
          </>
        ) : testStep ? (
          <TestFlow record={record} voiceAllowed={record.consent.given === true} onRecord={setRecord} onError={setError} script={script} />
        ) : (
          <div className="end-screen">
            <p className="big">{customerResultText(record, script).text}</p>
            <button className="repeat" onClick={() => speak(customerResultText(record, SPEAK_SCRIPT).text)}
              aria-label={t("repeat_label", script)}>{t("repeat", script)}</button>
          </div>
        )}
      </main>

      <section className="shopkeeper" aria-label="Shopkeeper controls">
        <div className="sk-head">
          <strong>Shopkeeper</strong>
          <span className="muted">Case {record.case_id}</span>
        </div>

        {stopped && (
          <div className="sk-alert">
            <p>{RULES.messages.red_shopkeeper_en}</p>
            <p>Danger signs: {record.danger_signs.map(label).join("; ")}</p>
          </div>
        )}
        {stopped && !isApproved("red_customer") && <p className="sk-note">{RULES.messages.draft_message_en}</p>}
        {!stopped && !question && testStep && <p className="sk-note">Interview complete. Phone tests: {testStep.replace(/_/g, " ")}.</p>}
        {finished && !stopped && <ShopkeeperResult record={record} />}
        {(stopped || !question) && <SaveStatus state={save.state} reason={save.reason} saved={isSaved} finished={finished} onRetry={doSave} />}
        {error && <p className="sk-error">Not accepted: {error}</p>}
        {voice && <VoicePanel u={voice.u} transcript={voice.transcript} />}
        {readbackActive && <p className="sk-note">Read-back: waiting for the customer to say or tap yes / no.</p>}

        <div className="sk-buttons">
          <button onClick={submit} disabled={!question || pending === null || readbackActive}>Next</button>
          <button onClick={redo} disabled={stopped || record.answers.length === 0}>Redo</button>
          <button disabled title="Needs an audit field in the case record: decision pending">Override</button>
        </div>
        <div className="sk-buttons">
          <button className="danger" onClick={() => setShowReport(!showReport)} aria-expanded={showReport}>
            Report danger sign
          </button>
        </div>
        {showReport && (
          <div className="sk-report">
            <p>Customer mentions one of these now? Pick it to mark the case Red (urgent):</p>
            {reportableDangerSigns().map((code) => (
              <button key={code} className="danger" onClick={() => reportDanger(code)}>{label(code)}</button>
            ))}
            <button className="ghost" onClick={() => setShowReport(false)}>Cancel</button>
          </div>
        )}
        <div className="sk-buttons">
          <button className="ghost" onClick={() => setShowJson(!showJson)}>{showJson ? "Hide" : "Show"} case record</button>
          <button className="ghost" onClick={startOver} disabled={newCaseBlocked}
            title={newCaseBlocked ? "A Red case must be saved first" : undefined}>New case</button>
        </div>
        {showJson && <pre className="json">{JSON.stringify(record, null, 2)}</pre>}
      </section>
    </div>
  );
}

// The shopkeeper always sees whether the server confirmed the save.
function SaveStatus(p: { state: string; reason?: string; saved: boolean; finished: boolean; onRetry: () => void }) {
  if (p.state === "saving") return <p className="sk-note">Saving the case…</p>;
  if (p.state === "failed") {
    return (
      <div className="sk-error-box">
        <p>NOT saved{p.reason ? ` (${p.reason})` : ""}.</p>
        <button onClick={p.onRetry}>Save again</button>
      </div>
    );
  }
  if (p.state === "partial") {
    return (
      <div className="sk-error-box partial">
        <p>Case saved, but a voice recording was not{p.reason ? ` (${p.reason})` : ""}.</p>
        <button onClick={p.onRetry}>Save again</button>
      </div>
    );
  }
  if (p.saved && p.finished) return <p className="sk-saved">Saved to the server. Waiting for the optometrist's review.</p>;
  if (p.state === "saved") return <p className="sk-saved">Interview saved. The test results save when the tests finish.</p>;
  return <p className="sk-note">Not saved yet.</p>;
}

// "reported_later:painful_red_eye" -> "painful red eye (reported later)"
function label(code: string): string {
  const later = code.startsWith("reported_later:");
  const base = (later ? code.slice("reported_later:".length) : code).replace(/_/g, " ");
  return later ? `${base} (reported later)` : base;
}

// Shopkeeper view of the last voice attempt. Raw transcripts are shown here
// for checking, never logged or sent anywhere else.
function VoicePanel({ u, transcript }: { u: Understanding; transcript: string | null }) {
  return (
    <div className="sk-voice">
      {u.dangerWordsHeard.length > 0 && (
        <p className="sk-alert">
          Possible danger words heard: {u.dangerWordsHeard.join(", ")}. Check with the customer now. If they have this
          now, use "Report danger sign".
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
