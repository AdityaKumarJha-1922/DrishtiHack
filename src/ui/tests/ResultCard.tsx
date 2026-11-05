// The profile card. The customer sees a short Hindi message; the shopkeeper
// sees the brain's result, reasons, the PRELIMINARY reading-glasses power to
// try, and lens codes. Nothing here is final until the optometrist reviews it.
import { RULES, type CaseRecord } from "../../brain";

export function customerResultText(record: CaseRecord): { text: string; key: string } {
  const r = record.triage.result;
  const key = r === "green" ? "result_green_hi" : r === "amber" ? "result_amber_hi" : "result_pending_hi";
  return { text: RULES.messages[key], key };
}

export function ShopkeeperResult({ record }: { record: CaseRecord }) {
  const { triage, suggestion, tests } = record;
  const { key } = customerResultText(record);
  const fmt = (p: number) => `+${p.toFixed(2)}`;
  return (
    <div className={`sk-result ${triage.result ?? "none"}`}>
      <p className="sk-result-head">
        Result: {triage.result ? triage.result.toUpperCase() : "NO RESULT (optometrist to decide)"} · PRELIMINARY, needs the optometrist's sign-off
      </p>
      <p>Why: {triage.reasons.join(", ") || "—"}</p>
      <p>
        Distance (3 m): right {tests.distance_va.right ?? "—"}, left {tests.distance_va.left ?? "—"}
        {tests.distance_va.pinhole ? `, pinhole ${tests.distance_va.pinhole}` : ""} · clock dial {tests.clock_dial ?? "—"}
        {tests.near_point_cm !== null ? ` · near point ${tests.near_point_cm} cm, works at ${tests.working_distance_cm} cm` : ""}
      </p>
      {suggestion.type === "readers" && suggestion.power !== null && (
        <p>
          Try stock reading glasses at the working distance: {suggestion.try.map(fmt).join(", ")} (formula: {fmt(suggestion.power)}).
          Not a prescription.
        </p>
      )}
      {suggestion.type === "readers" && suggestion.power === null && <p>Reading power could not be worked out: optometrist to decide.</p>}
      {suggestion.type === "full_test" && <p>Book a full eye test.</p>}
      {suggestion.lenses.length > 0 && <p>Lens ideas for the optometrist: {suggestion.lenses.join(", ")}</p>}
      {!RULES.message_approval[key] && <p className="muted">The customer's message is DRAFT wording.</p>}
    </div>
  );
}
