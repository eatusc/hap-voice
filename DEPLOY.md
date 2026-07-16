# Deploying hap-voice on a Mac server (production)

A complete runbook to run hap-voice as an always-on service on a Mac (e.g. a Mac
Studio), reachable by Twilio for real calls + texts. Written so you can follow it
by hand or hand it to Claude Code on the server.

---

## Assumptions — change these if your setup differs

| Thing | Value used below |
|---|---|
| Server user | `YOUR_USER` (home `/Users/YOUR_USER`) |
| App directory | `/Users/YOUR_USER/code/hap-voice` |
| Port | `3010` (must be free on the server — pick another if taken) |
| Public URL | `https://voice.helpaproduct.com` via a Cloudflare Tunnel |
| CPU | Apple Silicon (Homebrew at `/opt/homebrew`) |

Everything is macOS-native, so `say`, `whisper.cpp`, Postgres, etc. all run the
same as on the dev laptop — only the public-URL/service pieces are new.

---

## 0. Secrets you'll need on the server

- `OPENROUTER_API_KEY` — the LLM brain
- `ELEVENLABS_API_KEY` (+ a voice ID from *your* account) — the voice
- `TWILIO_AUTH_TOKEN` — for webhook signature validation (once implemented)

**Fastest path:** securely copy your laptop's working `.env.local` to the server,
then edit the few server-specific lines (Step 5). From the **laptop**:

```bash
scp /path/to/hap-voice/.env.local YOUR_USER@<server-host>:/Users/YOUR_USER/code/hap-voice/.env.local
```

(Do this after Step 2 so the directory exists. Never commit `.env.local`.)

---

## 1. Install prerequisites (on the server)

```bash
# Homebrew (skip if already installed)
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

brew install node postgresql@17 whisper-cpp cloudflared git
brew services start postgresql@17     # start Postgres now + on boot
```

Verify: `node -v` (want v20+), `whisper-cli --help | head -1`, `psql -c 'select 1' postgres`.

---

## 2. Clone + install

```bash
mkdir -p /Users/YOUR_USER/code
cd /Users/YOUR_USER/code
git clone https://github.com/eatusc/hap-voice.git
cd hap-voice
npm install
```

---

## 3. Download the speech model

```bash
bash scripts/get-model.sh small.en    # ~465MB, better accuracy for phone audio
# (or base.en for the faster/smaller option)
```

---

## 4. Create the database

```bash
npm run db:setup      # creates the hap_voice DB + schema (idempotent)
```

If `psql` roles complain, ensure your login user is a Postgres superuser:
`createuser -s "$(whoami)" 2>/dev/null; createdb "$(whoami)" 2>/dev/null` then re-run.

---

## 5. Configure `.env.local`

If you scp'd it from the laptop, just edit the server-specific lines below.
Otherwise create `.env.local` from the reference below (the repo intentionally
ships no `.env.example` — this section is the canonical variable list).

```bash
# Database
DATABASE_URL=postgres://localhost:5432/hap_voice

# Server
PORT=3010
PUBLIC_HOST=voice.helpaproduct.com      # your stable tunnel hostname (Step 9)

# Dashboard auth (REQUIRED) — gates the console; leave empty and nobody can log in.
# The telephony webhooks stay open regardless, so calls/texts keep working.
DASHBOARD_PASSWORD=<pick a strong password>
# DASHBOARD_SESSION_SECRET=<optional long random string>

# Twilio (signature validation — see Step 12)
TWILIO_AUTH_TOKEN=<your twilio auth token>
TWILIO_SKIP_VALIDATION=false

# LLM
OPENROUTER_API_KEY=<your key>
OPENROUTER_MODEL=openai/gpt-4o-mini

# Speech-to-text (local whisper.cpp)
STT_PROVIDER=whisper
WHISPER_CLI=/opt/homebrew/bin/whisper-cli
WHISPER_MODEL=./models/ggml-small.en.bin

# Text-to-speech (ElevenLabs — natural voice)
TTS_PROVIDER=elevenlabs
ELEVENLABS_API_KEY=<your key>
ELEVENLABS_VOICE_ID=EXAVITQu4vr4xnSDxMaL   # a voice in YOUR account (this = "Sarah")
ELEVENLABS_MODEL=eleven_flash_v2_5

# Persona
BUSINESS_NAME=HelpAProduct
ASSISTANT_GREETING=Thanks for calling HelpAProduct. This is the assistant — who am I speaking with?

# Voice provider: local (self-hosted pipeline) or retell (hosted agent).
# Boot default only — switchable live from the Settings page. See RETELL.md.
VOICE_PROVIDER=local
RETELL_API_KEY=<your retell key>        # the only required Retell entry
RETELL_AGENT_ID=                        # optional; Settings can auto-create the agent
RETELL_SKIP_VALIDATION=false
```

---

## 6. Fill in the knowledge base

Edit `knowledge.md` with real facts (services, pricing stance, hours, FAQ, what to
escalate). The assistant answers **only** from this file and takes a message for
anything not covered.

---

## 7. Build for production

```bash
npm run build     # content-hashed chunks; stable across restarts
```

`npm start` runs `NODE_ENV=production tsx server.ts`, which serves this build +
handles the Twilio media websocket in one process.

---

## 8. Run the app as a service (survives reboots + crashes)

Create `~/Library/LaunchAgents/com.helpaproduct.hapvoice.plist`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>com.helpaproduct.hapvoice</string>
  <key>ProgramArguments</key>
  <array>
    <string>/bin/zsh</string>
    <string>-lc</string>
    <string>cd /Users/YOUR_USER/code/hap-voice && exec npm start</string>
  </array>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>StandardOutPath</key><string>/Users/YOUR_USER/code/hap-voice/hapvoice.log</string>
  <key>StandardErrorPath</key><string>/Users/YOUR_USER/code/hap-voice/hapvoice.log</string>
</dict>
</plist>
```

Load + verify:

```bash
launchctl load -w ~/Library/LaunchAgents/com.helpaproduct.hapvoice.plist
sleep 8
curl -s localhost:3010 -o /dev/null -w "app: HTTP %{http_code}\n"   # expect 200
tail -f /Users/YOUR_USER/code/hap-voice/hapvoice.log                     # watch it
```

(To restart after a deploy: `launchctl kickstart -k gui/$(id -u)/com.helpaproduct.hapvoice`.)

---

## 9. Public URL — Cloudflare Tunnel (free, stable, handles the websocket)

Requires `helpaproduct.com`'s DNS to be on Cloudflare. (No domain on Cloudflare?
Use an ngrok reserved domain instead — see bottom.)

```bash
cloudflared tunnel login                       # opens browser; pick the domain
cloudflared tunnel create hap-voice            # creates tunnel + credentials json
cloudflared tunnel route dns hap-voice voice.helpaproduct.com
```

Create `~/.cloudflared/config.yml`:

```yaml
tunnel: hap-voice
credentials-file: /Users/YOUR_USER/.cloudflared/<TUNNEL_ID>.json   # printed by `create`
ingress:
  - hostname: voice.helpaproduct.com
    service: http://localhost:3010
  - service: http_status:404
```

Run it as a service:

```bash
sudo cloudflared service install       # installs a launchd daemon using config.yml
# or foreground to test first:
cloudflared tunnel --config ~/.cloudflared/config.yml run hap-voice
```

Confirm: `curl -s https://voice.helpaproduct.com -o /dev/null -w "%{http_code}\n"` → 200.
Make sure `PUBLIC_HOST=voice.helpaproduct.com` is set in `.env.local` (Step 5), then
restart the app service so the voice `<Stream>` uses that host.

---

## 10. Point Twilio at the server

Twilio Console → Phone Numbers → **your Twilio number**:

- **Voice → "A call comes in"** → `https://voice.helpaproduct.com/api/voice/incoming` (HTTP POST)
- **Messaging → "A message comes in"** → `https://voice.helpaproduct.com/api/sms/incoming` (HTTP POST)

If the number is in the "ThrivePact Messaging System" Messaging Service, set that
service's **Integration → Incoming Messages → "Defer to sender's webhook"** so the
number's SMS webhook (above) is actually used.

---

## 11. Verify

```bash
npm run db:seed                        # optional demo rows in the dashboard
npx tsx scripts/simulate-call.ts       # full pipeline, no phone: STT→LLM→TTS
```

Then call and text your Twilio number. Watch `hapvoice.log`; the call + text land in
the dashboard at `http://your-tailnet-host:3010` (tailnet) or
`localhost:3010` on the box — the public hostname only serves the telephony
webhooks, not the dashboard.

---

## 12. Security posture (current state)

Signature validation is **hard-gated to production**: `*_SKIP_VALIDATION=true`
is honored only when `NODE_ENV !== "production"`, so on this box (started with
`NODE_ENV=production`) a stray skip flag can never disable validation. Keep
`TWILIO_AUTH_TOKEN` + `RETELL_API_KEY` set so the checks have their keys.

- **Twilio webhooks** (`/api/voice/incoming`, `/api/voice/status`,
  `/api/voice/dial-status`, `/api/sms/incoming`) validate `X-Twilio-Signature`
  and fail closed.
- **Retell webhooks** (`/api/retell/inbound`, `/api/retell/events`) validate
  `x-retell-signature` (HMAC-SHA256, 5-minute freshness) and fail closed.
- **`/media` websocket** rejects streams that don't reference a live call
  created by the validated voice webhook.
- **Cloudflared ingress** (`cloudflared/config.yml`) exposes only those
  telephony paths; the dashboard and its APIs (settings, knowledge, Retell
  provisioning, data deletion) are 404 from the internet and reachable only over
  the tailnet. If you add a new webhook route, add it to the ingress allowlist
  too — and restart cloudflared
  (`launchctl kickstart -k gui/$UID/local.hapvoice-cloudflared`).

- **Dashboard password** — every console page and admin/data API (settings,
  knowledge, Retell provisioning, data deletion) requires a login session
  (`DASHBOARD_PASSWORD`), enforced by `middleware.ts`. This is defense-in-depth
  on top of the tailnet boundary: even if the tailnet widens or the ingress is
  misconfigured, the dashboard still demands the password. The telephony
  webhooks above are intentionally exempt (they enforce their own signatures).

### Data deletion (right-to-erasure)

Stored PII lives in `calls` (transcripts, extracted name/email/message, spam
notes) and `messages` (SMS/MMS bodies, detected OTP codes). To service a
"delete my data" request, run either from the box or over the tailnet:

```bash
# Erase everything tied to one phone number (calls + texts, both directions):
curl -X POST http://localhost:3010/api/data-deletion \
  -H 'content-type: application/json' -d '{"number":"+12135551234"}'

# Or delete a single call + its transcript by id:
curl -X DELETE http://localhost:3010/api/calls/42
```

Both are dashboard-side (tailnet-only) operator actions; transcript rows cascade
with the call. Deletion is permanent — there is no soft-delete/undo.

---

## 13. Shipping updates later

```bash
cd /Users/YOUR_USER/code/hap-voice
git pull
npm install
npm run build
launchctl kickstart -k gui/$(id -u)/com.helpaproduct.hapvoice
```

Rebuild only when code changes; between deploys it just runs. `.env.local` or
`knowledge.md` edits also need a restart (kickstart line above).

---

## Alternative to Cloudflare: ngrok reserved domain

If the domain isn't on Cloudflare:

```bash
brew install ngrok
ngrok config add-authtoken <token>
# reserve a domain in the ngrok dashboard, then run as a service:
ngrok http 3010 --domain=your-reserved.ngrok.app
```

Set `PUBLIC_HOST=your-reserved.ngrok.app` and use that host in the Twilio webhooks.
Run it under launchd the same way as the app (Step 8) so it survives reboots.
