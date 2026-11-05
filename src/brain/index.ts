// Public surface of the brain. The UI imports only from here.
export * from "./types";
export { createCase } from "./caseRecord";
export { nextQuestion, applyAnswer, undoLast, isStopped, progress, validateAnswer } from "./interview";
export type { ApplyResult, AnswerMeta } from "./interview";
export { triage, readingAdd, decide } from "./decide";
export { parseLocalNumber, matchSymptoms, normalizeText } from "./words";
export { QUESTIONS, RULES, getQuestion } from "./data";
export type { Question, Option } from "./data";
export { replySchema, questionForModel, parseReply, dangerWordsIn } from "./understanding";
export type { ModelReply, Understanding } from "./understanding";
export { voiceAction, readbackText, parseYesNo, isDangerValue } from "./readback";
export { isUrgent, reportDangerLater, reportableDangerSigns, LATE_REPORT_PREFIX } from "./danger";
export {
  optotypeHeightMm, startChart, answerChart, chartResult, randomPick, parseDirection, irisDiameterPx, focalRatio,
  distanceCm, steadyReading, pinholeNeeded, pinholeEye, nearTestsNeeded, nextTest, applyTestResult, DIRECTIONS,
} from "./phoneTests";
export type { Direction, ChartState, Pick, Point, TestStep } from "./phoneTests";
export { t, isApproved, questionText, optionLabel, CUSTOMER_TEXT, DEFAULT_SCRIPT, SPEAK_SCRIPT } from "./text";
export type { Script } from "./text";
