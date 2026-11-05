# NetraSaathi

Voice-first phone app for a small optical shop: a walk-in customer completes a
structured interview and gets **preliminary** glasses guidance in one visit.
A remote optometrist reviews and signs off every case. This is not an eye
examination or a diagnosis, and no value it shows is a prescription.

ZEISS Beyond Code 2026, Theme 3. Plan and spec: `docs/Plan.md`, `docs/Build_spec.md`.

## Run it

```bash
npm install
npm run dev        # opens on your network, so a phone on the same Wi-Fi can load it
npm test           # brain tests, including the seven golden cases
npm run build      # type-check + production build
```

## Layout

| Path | What it is |
| --- | --- |
| `src/brain/` | All decisions: next question, answer checks, danger stop, triage, reading power, lens codes. Runs on the phone, no network. |
| `src/brain/types.ts` | The one canonical case record. |
| `src/ui/` | Step 1 screen: customer interview + separate shopkeeper panel. No decisions here. |
| `data/questions.yaml` | Question bank, options, skip rules, danger answers. |
| `data/rules.yaml` | Triage thresholds, reading-power formula settings, lens rules, messages. |
| `data/symptom_words.csv`, `data/occupations.csv` | Word list and job table (clinical lead edits). |
| `tests/` | Vitest: golden cases and interview flow. |

## Status (M1 Steps 1 to 5, and M2 phone tests, done)

Step 1: brain module, data files, tap interview screen with truthful progress,
repeat button, Next/Redo in the shopkeeper panel, Red stop that Redo cannot undo.

Step 2: Edge Functions `stt`, `tts`, `understand` (see `supabase/README.md`);
voice answers after consent, which only pre-select an option the customer
confirms by tap; the brain's gate (`src/brain/understanding.ts`) rejects any
model reply that is malformed, off-question or outside the allowed values, and
takes the safer route when danger words are heard.

Step 3: voice answers to key questions (`readback: true` in `questions.yaml`), and any
low-confidence or danger-word answer, are read back from a fixed template
("Aapne kaha: … Kya yeh sahi hai?") and confirmed by a tap or a spoken haan/nahin
(read locally, no LLM). Two "Nahin" replies switch voice off for that question.
A voice danger answer is saved at once, never read back.

Step 4: danger signs are one-way, enforced in the brain (`src/brain/danger.ts`):
no answer, retry, Redo, model reply or network failure can clear or soften Red,
and `decide()` keeps Red even when every test would give Green. "Urgent" is derived
(`isUrgent()` = has a danger sign), not stored twice. The shopkeeper can "Report
danger sign" at any point (escalation only, stored as `reported_later:<code>`).
The Red screen has a repeat button.

Step 5: finished cases save automatically through the `save_case` and `save_audio`
Edge Functions (service role). The `cases` table and the private `case-audio` bucket
have RLS on with no public policies; the app's anon key can't touch them. The server
checks the exact canonical shape (`supabase/functions/_shared/case_shape.ts`) and
refuses saves that drop a danger sign, set a review, or change a reviewed case; a
database trigger also blocks danger-sign removal. Audio uploads only with consent,
and its private path goes in `answers[i].audio_url`. The shopkeeper sees "Saved" only
when the server confirmed it; "New case" stays disabled until a Red case is saved
(only a failed save allows discarding it, after a hard warning). 69 passing tests.

M2: after the interview, the phone tests run in the order the brain asks for
(`nextTest()` in `src/brain/phoneTests.ts`): tumbling-E chart at 3 m for each eye
(helper taps, or a spoken direction read locally), a pinhole re-test of the worse eye
when vision is reduced, the clock dial, then (40+ or a near complaint) the near
point and working distance, measured by the front camera from iris size or typed
in from a tape. Then `decide()` gives the profile card: Green/Amber/Red with
reasons and, for Green, a PRELIMINARY reading-glasses power plus the stock powers to
try. A once-per-phone setup sizes the screen with an ATM card and calibrates the
camera at a tape-measured 40 cm. All seven golden cases pass end to end through the
real interview and test procedures. 84 passing tests.

The camera uses MediaPipe Face Landmarker (`@mediapipe/tasks-vision`); its wasm is
copied from `node_modules` into `public/mediapipe` before dev/build (not committed)
and the face model is bundled in `public/models`, so it works offline. They load
only when a camera step starts.

Not yet: optometrist portal (queue, case view, approve/edit), real-phone
latency (Step 6), phone tests (M2), optometrist portal, offline service worker.

## Voice setup

Copy `.env.example` to `.env.local` with your Supabase URL and anon key, and deploy
the functions. Without these the app works by taps only (and may use Chrome's own
Hindi recognition when online).

## Known differences from the spec / open decisions

- **Draft wording.** Option labels in `questions.yaml` and the Hindi Red message are
  dev drafts, marked as such, awaiting the clinical lead.
- **Override is disabled.** The case record has no field to audit an override;
  needs a schema decision.
- **`suggestion.lenses` added** to hold lens codes (documented in Build_spec).
- **BP** is in the health question wording but has no case field.
- **"One eye clearly worse"** uses 2 lines (dev proposal, in `rules.yaml`).
- **Stock-reader trial** result has no case field, so Green is computed without it.
- **`suggestion.explain`** stays null until approved Hindi wording exists.
- **Script:** question text is romanised Hindi as in the spec; Devanagari is a decision
  for the clinical lead (it also affects how the phone voice reads it).
- **Saarika is legacy.** `stt` defaults to `saarika:v2.5` as specified; Sarvam
  now recommends `saaras:v3`. Switch with the `SARVAM_STT_MODEL` secret.
- **No server-side model fallback.** The `understand` function never switches
  model on refusal or unavailability; the app falls back to taps instead.
- **Read-back threshold** `speech.readback_below_confidence: 0.8` in `rules.yaml` is
  a provisional technical setting, not clinical; it needs review.
- **Read-back wording and key list are drafts.** The template, the yes/no word
  lists (`rules.yaml`) and which questions are key (`questions.yaml`) need the
  clinical lead's review. Tap answers are not read back: the visible selection
  plus "Aage" is the confirmation.
- **Red safety message is not approved.** `message_approval.red_customer_hi: false`
  in `rules.yaml`; the shopkeeper sees a draft notice until it is set to true.
- **M2 test procedures are proposals.** Letters per line (5), pass mark (3), starting
  line (6/60), the near target size (6/12 at 40 cm), "<6/60" for an unreadable chart,
  and re-testing only the worse eye with the pinhole are in `rules.yaml` as proposals
  awaiting clinical approval. The phone tests screen and estimate; they have not
  been compared with an optometrist's exam yet (that is the M3 pilot).
- **Customer test instructions and result messages are draft Hindi.**
- **`light_ok` is not checked** (no reliable light sensor in browsers); `distance_ok`
  and `eye_covered` are the helper's ticks, not camera checks (quality checks are Should).
- **The camera download is large** (about 13 MB of wasm plus a 3.6 MB model), fetched
  once when a camera step first runs; slow on a weak network.
- **The case saves when the tests finish** (or at once on Red), not between the
  interview and the tests.
- **Anyone with the anon key can call `save_case`.** Shops should sign in (Supabase
  Auth) so a case is tied to a real shop; `shop_id` is a fixed placeholder for now.
- **No audio retention period** is applied: the spec has none. Needs a decision.
- **No offline queue:** a case that can't be saved while offline stays only in the
  browser tab until "Save again" works (offline mode is a Should item).
- **Chrome's speech fallback keeps no audio**, so those answers have no recording.
- **Consent is a tap,** so `consent.audio_url` stays null (the spec mentions voice consent).
- **Late danger reports** have no "who reported" field; the `reported_later:` code
  prefix is the only marker. Audit fields need a schema decision.
- **Devanagari danger phrases** were added to `symptom_words.csv` because Sarvam and
  Chrome return Hindi in Devanagari; they are dev transliterations to be checked.
- `created_at` is stored in UTC (`Z`) rather than `+05:30`; both are valid ISO times.
