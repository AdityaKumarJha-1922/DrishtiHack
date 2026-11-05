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

## Status (M1, Step 1 done)

Done: brain module, data files, 18 passing tests, tap-only interview screen with
truthful progress, repeat button (phone's Hindi voice if present), Next/Redo in the
shopkeeper panel, Red stop that Redo cannot undo.

Not yet: speech services and the LLM (Step 2), read-back (Step 3), saving to
Supabase (Step 5), phone tests (M2), optometrist portal, offline service worker.

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
- `created_at` is stored in UTC (`Z`) rather than `+05:30`; both are valid ISO times.
