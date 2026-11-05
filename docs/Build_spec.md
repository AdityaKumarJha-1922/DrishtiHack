# NetraSaathi build spec (repo copy)

The living spec is the "Build spec" tab of the shared plan doc. The repo files are
the source of truth for code: `src/brain/types.ts` (case shape), `data/questions.yaml`
(interview), `data/rules.yaml` (decisions). Every clinical number is a v0 draft to
check with the optometrist before the pilot.

## Rules

- Rules decide, never the LLM. The LLM only turns speech into candidate answers and
  phrases read-backs.
- The brain runs on the phone; only speech, the LLM and storage need a network.
- Provider keys live only in Supabase Edge Function secrets.

## Architecture

Counter app (phone, Chrome PWA) -> brain module (on the phone) -> Supabase (cases,
private audio, realtime queue) <-> optometrist portal. Speech (Sarvam or Bhashini) and
the LLM (Claude Opus 5.5, `claude-opus-5-5`) are called only through edge functions.

## The case record

See `src/brain/types.ts`. Change log against the shared spec:

- **v0.1:** added `suggestion.lenses: string[]` for lens suggestion codes from
  `data/rules.yaml` (the spec's `suggestion` object had nowhere to hold them).
- Tap answers store `transcript: null`, `confidence: null`, `confirmed: true`.
- `review` is `null` until the optometrist acts.

## Voice understanding (Step 2)

- The app sends `{ question, schema, transcript }` to `understand`. The schema
  (from `replySchema()` in `src/brain/understanding.ts`) allows exactly:
  `question_id` (the current one), `path` (its `fills.path`), `unclear` (boolean),
  `value` (one of the question's allowed values, or null), `confidence` (0 to 1).
- The reply is untrusted. `parseReply()` rejects malformed JSON, extra or missing
  fields, the wrong question or path, invalid values, bad confidence, and
  unclear/value conflicts. On the danger question, a "no danger" reply is
  rejected when danger words from `symptom_words.csv` are in the transcript.
- A gated answer only pre-selects an option; the customer confirms by tap. Its
  transcript and confidence are saved in `answers[]` only if kept.
- `speech.readback_below_confidence` (rules.yaml, provisional): below it, the
  answer is read back. Confidence never affects triage.

## Read-back (Step 3)

`voiceAction()` in `src/brain/readback.ts` decides what happens to a gated voice answer:

| Case | Action |
| --- | --- |
| The value is a danger answer | Saved at once (`confirmed: false`); never read back, so "Nahin" can't undo it |
| Key question (`readback: true`), low confidence, or danger words heard | Read back; saved only on Haan (`confirmed: true`) |
| Other questions, high confidence | Pre-selected; saved when the customer taps "Aage" |
| Unclear or rejected | Customer taps |

The read-back sentence is `speech.readback_template_hi` filled with the question's
own option labels (numbers use `unit_hi`), so it cannot change the answer. A spoken
reply is matched against `yes_words` / `no_words` as whole words; both or neither
means unclear and the customer taps. After `max_readback_rejections` "Nahin" replies,
voice is off for that question. The shopkeeper's Next is disabled during a read-back.

## Danger signs (Step 4)

- Sources: a danger answer to `danger_signs` (each chosen code), a "yes" to
  `recent_change` (`recent_change_on_medicine_or_diabetes`), or the shopkeeper's
  "Report danger sign" (`reported_later:<code>`, codes from the `danger_signs`
  question's `danger` list only).
- Any danger sign: the interview stops (`nextQuestion()` is null, `applyAnswer()`
  and `undoLast()` refuse), triage is Red with `danger_sign:<code>` reasons, the
  suggestion is "doctor" with no power or lenses. `isUrgent()` is true.
- One-way: there is no function that removes a danger sign.
- Customer message: `messages.red_customer_hi`, shown with a repeat button. Until
  `message_approval.red_customer_hi` is true, the shopkeeper sees a draft notice.

## Saving (Step 5)

- Table `public.cases`: `case_id` (key), `shop_id`, `created_at`, `saved_at`,
  `record` (the canonical record), `urgent` (generated from `record.danger_signs`).
  The record's own `case_id`/`shop_id` must match the columns.
- RLS on, no policies: only the service role (inside Edge Functions) reads or writes.
  The optometrist portal's access is a later decision.
- `save_case` checks the exact shape (`_shared/case_shape.ts`, kept in step with
  `types.ts` by `tests/case_shape.test.ts`) and refuses `danger_sign_removed`,
  `review_set_by_shop`, `already_reviewed`, `shop_mismatch`. A trigger also refuses any
  update that removes a danger sign.
- Audio: only after the case is saved with `consent.given === true`, to the private
  `case-audio` bucket at `<case_id>/<answer_index>-<q>.webm`; that path goes in the
  existing `answers[i].audio_url`. No retention period yet (open decision).

## Triage (v0, from rules.yaml)

- **Red:** any danger sign; diabetes or TB medicine with a recent vision change;
  distance vision worse than 6/12 that the pinhole does not improve.
- **Amber:** distance vision worse than 6/12 that improves 2+ lines with the pinhole;
  clock dial uneven; one eye clearly worse; under 40 with near complaints; no stock
  power works in the trial.
- **Green:** age 40+, distance vision 6/12 or better in each eye, clock dial even, no
  danger signs, a stock power works. Diabetes with no recent change still allows Green,
  with a yearly retina check.

Reading add (preliminary): `100 / work_cm − 0.5 × (100 / near_point_cm)`, rounded to
0.25; the trial tries it and one 0.5 step either side.

## Golden test cases

| # | Person | Key facts | Expected |
| --- | --- | --- | --- |
| 1 | 52, tailor | Near blur; 6/9 both; near point 40 cm; works at 26 cm | Green, +2.50 |
| 2 | 45, truck driver | Night blur; 6/18, pinhole 6/9 | Amber; driving lenses after test |
| 3 | 60, farmer | Sudden blur in one eye | Red |
| 4 | 58, shopkeeper, diabetes | Near blur; 6/9; no recent change | Green + yearly retina check |
| 5 | 50, TB medicine | Colours look faded | Red |
| 6 | 35, office worker | Eye strain after screen work | Amber |
| 7 | 65, homemaker | 6/24; pinhole doesn't help | Red |

## Counter UX rules

Voice first, tap second, text last; one question per screen; big buttons; repeat
button always on screen; shopkeeper controls apart from the customer's screen; no
clinical words on the customer's screen; works on a Rs 8,000–10,000 Android phone.
