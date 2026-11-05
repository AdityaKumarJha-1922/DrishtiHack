// Step 1 screen: the customer interview (top) and the shopkeeper panel (bottom).
//
// React note for Python readers: a component is a function that returns what
// to draw. `useState` keeps a value between redraws, like an attribute on an
// object; calling its setter redraws the screen with the new value.
import { useState } from "react";
import {
  applyAnswer, createCase, isStopped, nextQuestion, progress, undoLast, RULES,
  type AnswerValue, type CaseRecord,
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

  const question = nextQuestion(record);
  const stopped = isStopped(record);
  const { answered, atMost } = progress(record);

  // Every answer goes through the brain; a rejected answer changes nothing.
  function submit() {
    if (!question || pending === null) return;
    const result = applyAnswer(record, question.id, pending);
    if (result.ok) {
      setRecord(result.record);
      setPending(null);
      setError(null);
    } else {
      setError(result.error);
    }
  }

  function redo() {
    const result = undoLast(record);
    if (result.ok) {
      setRecord(result.record);
      setPending(null);
      setError(null);
    } else {
      setError(result.error);
    }
  }

  function startOver() {
    if (window.confirm("Start a new case? The current one is not saved yet.")) {
      setRecord(newCase());
      setPending(null);
      setError(null);
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

        <div className="sk-buttons">
          <button onClick={submit} disabled={!question || pending === null}>Next</button>
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
