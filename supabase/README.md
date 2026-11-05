# Edge Functions

Three Deno functions. Provider keys live only here, as Supabase secrets.

| Function | In | Out | Provider |
| --- | --- | --- | --- |
| `stt` | multipart `file` (audio) | `{ transcript }` | Sarvam speech-to-text |
| `tts` | `{ text }` | `{ audio_base64, mime }` | Sarvam Bulbul |
| `understand` | `{ question, schema, transcript }` | `{ reply }` (raw JSON text, untrusted) | Anthropic |

Every error comes back as `{ error: "<code>" }`. The app then falls back to taps.
Functions log only error codes, never audio, transcripts or customer details.

## Deploy

```bash
supabase link --project-ref <your-project-ref>
supabase secrets set SARVAM_API_KEY=... ANTHROPIC_API_KEY=...
supabase functions deploy stt
supabase functions deploy tts
supabase functions deploy understand
```

Then put the project URL and anon key in the app's `.env.local` (see `.env.example`).

## Optional settings (secrets)

| Secret | Default | Note |
| --- | --- | --- |
| `SARVAM_STT_MODEL` | `saarika:v2.5` | As specified. Sarvam now calls Saarika legacy and recommends `saaras:v3`. |
| `SARVAM_TTS_MODEL` | `bulbul:v3` | |
| `SARVAM_TTS_SPEAKER` | API default | Must match the TTS model; e.g. a female voice for the customer's choice. |
| `ANTHROPIC_MODEL` | `claude-opus-5-5` | If unavailable, `understand` returns `model_unavailable`; it never switches model. |
| `ANTHROPIC_EFFORT` | `low` | Lower effort is the first lever if a turn is slow. |

## Local type-check

```bash
deno check --no-config --no-lock stt/index.ts tts/index.ts understand/index.ts
```
