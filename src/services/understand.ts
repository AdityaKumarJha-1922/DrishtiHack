// Sends a transcript to our `understand` function, then passes the model's
// reply through the brain's gate (parseReply). The UI only ever sees the
// gated result.
import { dangerWordsIn, parseReply, questionForModel, replySchema, type Question, type Understanding } from "../brain";
import { callFunction } from "./net";

const UNDERSTAND_TIMEOUT_MS = 25_000;

export async function understand(q: Question, transcript: string): Promise<Understanding> {
  const text = transcript.trim();
  if (!text) return { kind: "rejected", reason: "empty_transcript", dangerWordsHeard: [] };

  const r = await callFunction<{ reply: unknown }>(
    "understand",
    { question: questionForModel(q), schema: replySchema(q), transcript: text },
    UNDERSTAND_TIMEOUT_MS,
  );
  // On a service failure the brain still checks the transcript for danger words.
  if (!r.ok) return { kind: "rejected", reason: r.reason, dangerWordsHeard: dangerWordsIn(text) };
  return parseReply(r.data.reply, q, text);
}
