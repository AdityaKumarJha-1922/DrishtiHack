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

## Status (M1, Steps 1 to 4 done)

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
The Red screen has a repeat button. 57 passing tests.

Not yet: saving to Supabase (Step 5), real-phone
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
- **New case discards an unsaved Red case** (after a strong warning). Step 5 must
  block "New case" until a Red case is saved.
- **Late danger reports** have no "who reported" field; the `reported_later:` code
  prefix is the only marker. Audit fields need a schema decision.
- **Devanagari danger phrases** were added to `symptom_words.csv` because Sarvam and
  Chrome return Hindi in Devanagari; they are dev transliterations to be checked.
- `created_at` is stored in UTC (`Z`) rather than `+05:30`; both are valid ISO times.
