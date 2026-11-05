// Public surface of the brain. The UI imports only from here.
export * from "./types";
export { createCase } from "./caseRecord";
export { nextQuestion, applyAnswer, undoLast, isStopped, progress, validateAnswer } from "./interview";
export type { ApplyResult, AnswerMeta } from "./interview";
export { triage, readingAdd, decide } from "./decide";
export { parseLocalNumber, matchSymptoms } from "./words";
export { QUESTIONS, RULES, getQuestion } from "./data";
export type { Question, Option } from "./data";
export { replySchema, questionForModel, parseReply, dangerWordsIn } from "./understanding";
export type { ModelReply, Understanding } from "./understanding";
export { voiceAction, readbackText, parseYesNo, isDangerValue } from "./readback";
