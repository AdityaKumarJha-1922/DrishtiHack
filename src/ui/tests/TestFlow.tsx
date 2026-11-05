// Runs the phone tests in the order the brain asks for (nextTest), writes each
// result through applyTestResult (which validates it), and when nothing is
// left, runs decide() so the record carries the Green/Amber/Red result.
import { useState } from "react";
import { applyTestResult, decide, nextTest, RULES, type CaseRecord } from "../../brain";
import { loadCalibration, saveCalibration, type Calibration } from "./calibration";
import CalibrationScreen from "./CalibrationScreen";
import ChartTest from "./ChartTest";
import { ClockDial, NearTest } from "./ClockAndNear";

interface Props {
  record: CaseRecord;
  voiceAllowed: boolean;
  onRecord: (r: CaseRecord) => void;
  onError: (e: string) => void;
}

export default function TestFlow({ record, voiceAllowed, onRecord, onError }: Props) {
  const [calib, setCalib] = useState<Calibration>(loadCalibration);
  const [recalibrate, setRecalibrate] = useState(false);
  const step = nextTest(record);

  type Value = Parameters<typeof applyTestResult>[1];
  function save(v: Value, quality = {}) {
    const res = applyTestResult(record, v, quality);
    if (!res.ok) { onError(res.error); return; }
    onRecord(nextTest(res.record) === null ? decide(res.record) : res.record);
  }

  if (!calib.pxPerMm || recalibrate) {
    return (
      <CalibrationScreen initial={calib} onDone={(c) => { saveCalibration(c); setCalib(c); setRecalibrate(false); }} />
    );
  }
  if (!step) return null;

  return (
    <div>
      <p className="tests-intro">{RULES.messages.tests_intro_hi}</p>
      {(step === "distance_right" || step === "distance_left" || step === "pinhole") && (
        <ChartTest key={step} step={step} pxPerMm={calib.pxPerMm} voiceAllowed={voiceAllowed}
          onResult={(snellen, quality) => save({ step, snellen }, quality)} />
      )}
      {step === "clock_dial" && <ClockDial onResult={(even) => save({ step, even })} />}
      {(step === "near_point" || step === "working_distance") && (
        <NearTest key={step} step={step} pxPerMm={calib.pxPerMm} focalRatio={calib.focalRatio}
          onResult={(cm) => save({ step, cm })} />
      )}
      <button className="ghost-light small-link" onClick={() => setRecalibrate(true)}>Phone setup again</button>
    </div>
  );
}
