# hap-voice

An AI voice receptionist for the HelpAProduct line (+1 555-123-4567). It answers
calls, has a natural spoken conversation, screens who's calling and why, takes a
message, flags spam/robocalls, and logs everything to a dashboard.

Built to be **self-hosted and free** wherever possible. The only paid piece is the
LLM (OpenRouter), which you asked for — and even that can be swapped for a local
model (Ollama) later.

## The pipeline

```
 Caller ── phone ──► Twilio ──► Media Streams (websocket) ──► hap-voice
                                                                │
        home-grown VAD ──► whisper.cpp (STT) ──► OpenRouter (LLM) ──► TTS ──┘
        (energy-based)      (local, free)         (your key)      (say/Piper/11L)
```

| Stage            | Engine                         | Cost | Where |
|------------------|--------------------------------|------|-------|
| Phone carrier    | Twilio Media Streams           | Twilio's per-min | cloud |
| Voice activity   | home-grown energy VAD          | free | `lib/audio/vad.ts` |
| µ-law codec      | home-grown G.711               | free | `lib/audio/mulaw.ts` |
| Speech-to-text   | **whisper.cpp** (`base.en`)    | free | local |
| LLM brain        | **OpenRouter** (gpt-4o-mini)   | ~pennies/call | cloud (your key) |
| Text-to-speech   | macOS `say` / **Piper** / 11Labs | free / free / paid | local |
| Storage          | local Postgres                 | free | local |

## Quick start

```bash
# 1. Install deps
npm install

# 2. Postgres (uses your local Homebrew Postgres)
npm run db:setup          # creates the hap_voice database + schema
npm run db:seed           # optional: a few demo calls for the dashboard

# 3. Configure
# edit .env.local as needed (all supported variables are documented in DEPLOY.md)
#   → set OPENROUTER_API_KEY to enable the AI brain

# 4. Run
npm run dev               # http://localhost:3010
```

The whisper model (`models/ggml-base.en.bin`) and `whisper-cli` are already
installed on this machine. On a fresh checkout, get them with:

```bash
brew install whisper-cpp
bash scripts/get-model.sh base.en
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

Then open the dashboard — the simulated call appears in the log with transcript,
extracted caller details, and a spam score (the last two need `OPENROUTER_API_KEY`).

## Connect the real phone number

Twilio needs a public URL to reach this server. In local dev, tunnel it:

```bash
# e.g. with cloudflared or ngrok
ngrok http 3010
# copy the https host, e.g. abc123.ngrok-free.app
```

Set `PUBLIC_HOST=abc123.ngrok-free.app` in `.env.local` (or leave it blank — the TwiML
route also derives the host from the incoming request). Then in the Twilio Console
for +1 555-123-4567 → **Voice Configuration → A call comes in**:

- **Webhook:** `https://abc123.ngrok-free.app/api/voice/incoming` (HTTP POST)
- **Status callback:** `https://abc123.ngrok-free.app/api/voice/status` (optional)

Call the number and talk to it. Set `TWILIO_AUTH_TOKEN` and
`TWILIO_SKIP_VALIDATION=false` to validate Twilio signatures in production.

### Receiving texts (verification codes, business SMS)

The same number can receive SMS/MMS — useful as a business line and for the
verification codes services text you. **Receiving needs no A2P 10DLC
registration** (that only governs *outbound* app messaging), so inbound just
works. In the Twilio Console → **Messaging → A message comes in**:

- **Webhook:** `https://abc123.ngrok-free.app/api/sms/incoming` (HTTP POST)

Texts show up under **Texts** in the dashboard, and any verification/OTP code in
the body is detected and made one-tap copyable. Note: a few strict services
(Google, WhatsApp, some banks) refuse to send codes to Twilio/VoIP numbers — a
carrier-level check, not something this app controls.

## Dashboard

- **Calls** — every call, newest first: caller, summary, spam badge, length.
- **Potential spam** — calls the LLM flagged (score ≥ 0.6).
- **Call detail** — full transcript, extracted name/company/reason/callback/message,
  spam assessment, and a one-click **Block number**.
- **Blocked** — manage the block list. Blocked callers get `<Reject>` before the AI
  ever answers.

## Optional: Retell AI as the voice provider

The whole conversation layer can be swapped for a hosted
[Retell AI](https://www.retellai.com) agent from the Settings page — a live
toggle, just like switching TTS providers. Setup is one key in `.env.local`
plus a button that auto-creates the agent (prompt, greeting, knowledge base,
extraction fields, webhook) through Retell's API. The dashboard, blocked-numbers
list, spam fields, and SMS stay exactly as they are, and calls fall back to the
local pipeline if Retell is down. Details: **[RETELL.md](RETELL.md)**.

## Swapping providers (all via `.env.local`)

- **TTS → Piper** (free, portable to Linux; `say` is macOS-only):
  `TTS_PROVIDER=piper` + install Piper and a voice `.onnx`.
- **TTS → ElevenLabs** (you have an account): `TTS_PROVIDER=elevenlabs` +
  `ELEVENLABS_API_KEY`.
- **LLM model:** `OPENROUTER_MODEL=...` (any OpenRouter model; fast+cheap is best
  for live calls).
- **Bigger whisper model:** download `ggml-small.en.bin` and point `WHISPER_MODEL`
  at it for higher accuracy (a bit slower).

## Porting off localhost later

Everything is local-first by design. To move to a server:

1. **Postgres:** point `DATABASE_URL` at a hosted Postgres (Neon/Supabase/RDS).
   The schema in `db/schema.sql` is portable. (A `docker-compose.yml` is included
   for an isolated Postgres if you prefer.)
2. **TTS:** switch `say` → `piper` (Linux-friendly).
3. **Host:** run `npm run build` then `npm start`; put it behind a stable HTTPS
   host and set `PUBLIC_HOST`.

## Layout

```
server.ts                  Custom Next server + /media websocket upgrade
lib/
  config.ts                Env-driven config
  db.ts                    Postgres pool + query helpers + types
  audio/{mulaw,wav,vad}.ts Home-grown codec, WAV IO, VAD
  stt/                     whisper.cpp transcription
  tts/                     say / piper / elevenlabs
  llm/openrouter.ts        Live replies, detail extraction, spam scoring
  telephony/
    twilio-stream.ts       Media Streams protocol
    call-session.ts        Per-call orchestrator (the core)
app/                       Dashboard (Next App Router) + API + TwiML routes
scripts/                   db-setup, db-seed, simulate-call
```
