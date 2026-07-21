# hap-voice

[![CI](https://github.com/eatusc/hap-voice/actions/workflows/ci.yml/badge.svg)](https://github.com/eatusc/hap-voice/actions/workflows/ci.yml)

An AI voice receptionist for a Twilio phone number. It answers calls, has a
natural spoken conversation, screens who's calling and why, takes a message,
flags spam/robocalls, and logs everything to a dashboard.

Built to be **self-hosted and free** wherever possible. The only paid piece is
the LLM (OpenRouter), and even that can be swapped for a local model (Ollama)
later.

## The pipeline

```
 Caller ── phone ──► Twilio ──► Media Streams (websocket) ──► hap-voice
                                                                │
        home-grown VAD ──► whisper.cpp (STT) ──► OpenRouter (LLM) ──► TTS ──┘
        (energy-based)      (local, free)        (your API key)   (say/Piper/Kokoro/11L)
```

| Stage            | Engine                         | Cost | Where |
|------------------|--------------------------------|------|-------|
| Phone carrier    | Twilio Media Streams           | Twilio's per-min | cloud |
| Voice activity   | home-grown energy VAD          | free | `lib/audio/vad.ts` |
| µ-law codec      | home-grown G.711               | free | `lib/audio/mulaw.ts` |
| Speech-to-text   | **whisper.cpp** (`base.en`)    | free | local |
| LLM brain        | **OpenRouter** (gpt-4o-mini)   | ~pennies/call | cloud (your key) |
| Text-to-speech   | macOS `say` / **Piper** / **Kokoro** / ElevenLabs | free / free / free / paid | local (11L: cloud) |
| Storage          | local Postgres                 | free | local |

How a call actually flows through these stages, including barge-in handling and
turn serialization, is written up in
**[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)**.

## Quick start

```bash
# 1. Install deps
npm install

# 2. Postgres (uses a local Postgres, e.g. from Homebrew)
npm run db:setup          # creates the hap_voice database + schema
npm run db:seed           # optional: a few demo calls for the dashboard

# 3. Configure
cp .env.example .env.local   # then edit; every variable is documented inline + in DEPLOY.md
#   set OPENROUTER_API_KEY to enable the AI brain
#   set DASHBOARD_PASSWORD to be able to log in to the dashboard
#   (if it's left empty, nobody can sign in and the dashboard stays locked;
#    calls and texts still work, since the telephony webhooks aren't gated)

# 4. Run
npm run dev               # http://localhost:3010
```

Speech-to-text needs whisper.cpp and a model. On a fresh checkout:

```bash
brew install whisper-cpp
bash scripts/get-model.sh base.en    # downloads models/ggml-base.en.bin
```

TTS defaults to macOS `say` (free, zero-setup).

## Test the brain without a phone

The simulator runs the **real** VAD → STT → LLM → TTS pipeline against a WAV of
speech (or one it generates with `say`), and writes the assistant's spoken reply
to `sim-out/`:

```bash
npx tsx scripts/simulate-call.ts                    # generates a caller line
npx tsx scripts/simulate-call.ts my-recording.wav   # use your own audio
```

Then open the dashboard: the simulated call appears in the log with transcript,
extracted caller details, and a spam score (the last two need `OPENROUTER_API_KEY`).

## Connect the real phone number

Twilio needs a public URL to reach this server. In local dev, tunnel it:

```bash
# e.g. with cloudflared or ngrok
ngrok http 3010
# copy the https host, e.g. abc123.ngrok-free.app
```

Set `PUBLIC_HOST=abc123.ngrok-free.app` in `.env.local` (or leave it blank; the
TwiML route also derives the host from the incoming request). Then in the Twilio
Console for your number, under **Voice Configuration → A call comes in**:

- **Webhook:** `https://abc123.ngrok-free.app/api/voice/incoming` (HTTP POST)
- **Status callback:** `https://abc123.ngrok-free.app/api/voice/status` (optional)

Call the number and talk to it. Set `TWILIO_AUTH_TOKEN` so signature validation
has its key. In production (`NODE_ENV=production`) validation is always on and
`TWILIO_SKIP_VALIDATION` is ignored; the flag only skips checks in local dev.

### Receiving texts (verification codes, business SMS)

The same number can receive SMS/MMS, useful as a business line and for the
verification codes services send by text. **Receiving needs no A2P 10DLC
registration** (that only governs *outbound* app messaging), so inbound just
works. In the Twilio Console → **Messaging → A message comes in**:

- **Webhook:** `https://abc123.ngrok-free.app/api/sms/incoming` (HTTP POST)

Texts show up under **Texts** in the dashboard, and any verification/OTP code in
the body is detected and made one-tap copyable. Note: a few strict services
(Google, WhatsApp, some banks) refuse to send codes to Twilio/VoIP numbers; that
is a carrier-level check, not something this app controls.

## Dashboard

- **Calls**: every call, newest first: caller, summary, spam badge, length.
- **Potential spam**: calls the LLM flagged (score ≥ 0.6).
- **Call detail**: full transcript, extracted name/company/reason/callback/message,
  spam assessment, and a one-click **Block number**.
- **Blocked**: manage the block list. Blocked callers get `<Reject>` before the AI
  ever answers.

## Optional: Retell AI as the voice provider

The whole conversation layer can be swapped for a hosted
[Retell AI](https://www.retellai.com) agent from the Settings page: a live
toggle, just like switching TTS providers. Setup is one key in `.env.local`
plus a button that auto-creates the agent (prompt, greeting, knowledge base,
extraction fields, webhook) through Retell's API. The dashboard, blocked-numbers
list, spam fields, and SMS stay exactly as they are, and calls fall back to the
local pipeline if Retell is down. Details: **[RETELL.md](RETELL.md)**.

## Swapping providers (all via `.env.local`)

- **TTS → Piper** (free, portable to Linux; `say` is macOS-only):
  `TTS_PROVIDER=piper` + install Piper and a voice `.onnx`.
- **TTS → Kokoro** (free, local neural TTS, close to ElevenLabs naturalness):
  `TTS_PROVIDER=kokoro` + run the persistent Python service in `kokoro/`
  (see `kokoro/server.py`; it keeps the model loaded so synthesis stays fast).
  `KOKORO_URL` points at it, default `http://127.0.0.1:5111`.
- **TTS → ElevenLabs** (paid, hosted): `TTS_PROVIDER=elevenlabs` +
  `ELEVENLABS_API_KEY`.
- **LLM model:** `OPENROUTER_MODEL=...` (any OpenRouter model; fast+cheap is best
  for live calls).
- **Bigger whisper model:** download `ggml-small.en.bin` and point `WHISPER_MODEL`
  at it for higher accuracy (a bit slower).

The TTS provider is also switchable live from the Settings page; it takes effect
on the next sentence the assistant speaks, no restart needed.

## Porting off localhost later

Everything is local-first by design. To move to a server:

1. **Postgres:** point `DATABASE_URL` at a hosted Postgres (Neon/Supabase/RDS).
   The schema in `db/schema.sql` is portable. (A `docker-compose.yml` is included
   for an isolated Postgres if you prefer.)
2. **TTS:** switch `say` → `piper` or `kokoro` (both Linux-friendly).
3. **Host:** run `npm run build` then `npm start`; put it behind a stable HTTPS
   host and set `PUBLIC_HOST`.

See **[DEPLOY.md](DEPLOY.md)** for a full production runbook.

## Security posture

The design assumes two trust zones: **the public internet** (only telephony
webhooks reach it) and **a private network** (the dashboard + its APIs).

- **Webhook signatures, fail-closed.** Twilio (`X-Twilio-Signature`, HMAC-SHA1)
  and Retell (`x-retell-signature`, HMAC-SHA256 with 5-minute freshness) are
  verified with timing-safe comparisons; a missing key/header/bad signature is
  rejected. Skipping validation is **hard-gated to non-production**: the
  `*_SKIP_VALIDATION` flags are ignored when `NODE_ENV=production`, so a live
  deployment always validates regardless of env.
- **Media websocket is not a back door.** `/media` streams must reference a live
  call created by a signature-validated voice webhook, or they're dropped before
  any STT/LLM/TTS runs.
- **Dashboard password.** Every dashboard page and admin/data API (settings,
  knowledge, Retell provisioning, data deletion) requires a login session,
  enforced by `middleware.ts` + `lib/auth.ts`: a shared password
  (`DASHBOARD_PASSWORD`) mints a signed, HttpOnly session cookie via `/login`.
  If no password is configured, nobody can authenticate and the dashboard is
  fully locked. The telephony webhooks are intentionally exempt; they enforce
  their own request signatures instead.
- **Least public surface.** The Cloudflare Tunnel (`cloudflared/config.example.yml`)
  exposes *only* the telephony paths, so the dashboard and admin APIs are
  unreachable from the internet even before the password check. The password is
  defense-in-depth on top of that network boundary, not a substitute for it.
- **No shell, no string SQL.** Subprocesses (`whisper`/`say`/`piper`) are spawned
  with argv arrays, never a shell; all SQL is parameterized and `updateCall`
  guards columns against an allowlist.
- **Secrets stay out of the repo.** Keys live in `.env.local` (gitignored);
  webhook handlers never log request bodies (which carry caller PII/transcripts).
- **Right-to-erasure.** `POST /api/data-deletion` wipes every call + text tied to
  a number; `DELETE /api/calls/[id]` removes one call and its transcript.

## Layout

```
server.ts                  Custom Next server + /media websocket upgrade
middleware.ts              Dashboard auth gate (telephony webhooks exempt)
lib/
  config.ts                Env-driven config
  auth.ts                  Password login + signed session cookies
  db.ts                    Postgres pool + query helpers + types
  audio/{mulaw,wav,vad}.ts Home-grown codec, WAV IO, VAD
  stt/                     whisper.cpp transcription
  tts/                     say / piper / kokoro / elevenlabs
  llm/openrouter.ts        Live replies, detail extraction, spam scoring
  telephony/
    twilio-stream.ts       Media Streams protocol
    call-session.ts        Per-call orchestrator (the core)
app/                       Dashboard (Next App Router) + API + TwiML routes
kokoro/                    Optional local neural TTS service (Python)
docs/                      Architecture notes
scripts/                   db-setup, db-seed, simulate-call
```

## Development

```bash
npm test              # unit tests (vitest): µ-law codec, resampler, VAD, auth
npm run typecheck     # tsc --noEmit
npm run lint          # eslint
```
