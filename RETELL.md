# Retell AI as an optional voice provider

The app supports two voice pipelines, switched **live from Settings → Call
routing** — exactly like switching TTS providers. No Twilio console changes, no
redeploy:

| | `local` (default) | `retell` |
|---|---|---|
| Who talks | VAD → whisper.cpp → OpenRouter → TTS | a hosted Retell agent |
| Audio path | Twilio Media Streams → `/media` websocket | Twilio `<Dial><Sip>` bridge to Retell |
| Logging | written live by `lib/telephony/call-session.ts` | Retell webhooks → `/api/retell/events` |
| Dashboard | same calls/transcripts/spam dashboard for both | same |

## Setup (once, ~2 minutes)

1. In the [Retell dashboard](https://dashboard.retellai.com) → API Keys, create
   a fresh key (**rotate it if a key was ever pasted into a chat**). Add to
   `.env.local` on the server:

   ```bash
   RETELL_API_KEY=key_…          # the only required entry
   RETELL_SKIP_VALIDATION=false
   ```

   Restart, and make sure `npm run db:setup` has been run once since the Retell
   columns were added.

2. Open **Settings → Call routing** and click **Create Retell agent**. The app
   builds the whole agent through Retell's API from what it already has:
   - the receptionist system prompt (same one the local pipeline uses),
   - the current **knowledge base** (`knowledge.md`) baked into the prompt,
   - the **greeting** as the agent's opening line,
   - the ten **post-call extraction fields** (name, company, email, reason,
     callback, message, summary, spam score/reason/flag),
   - the **event webhook** pointed at `https://<PUBLIC_HOST>/api/retell/events`.

   Nothing needs to be configured in the Retell dashboard. The agent id is
   stored in app settings automatically (or set `RETELL_AGENT_ID` in
   `.env.local` to use an agent you made yourself).

3. Switch **Voice provider** to *Retell AI* and save. Done — the next call is
   answered by Retell. Switch back to *Local* any time; that's the whole
   rollback.

To pick a different agent voice, change it in the Retell dashboard (the default
is `11labs-Adrian`). After editing the greeting, business name, or knowledge
base here, click **Re-sync Retell agent** — it updates the prompt/greeting/
webhook in place and keeps your voice choice.

## How a call flows in Retell mode

1. Twilio's number webhook still hits `POST /api/voice/incoming` (unchanged).
2. Blocked numbers are rejected right there — before Retell ever sees the call.
3. The app registers the call with Retell (`/v2/register-phone-call`), attaching
   the local call id as metadata, and answers Twilio with
   `<Dial><Sip>sip:{call_id}@sip.retellai.com</Sip></Dial>`.
4. Retell's agent handles the conversation and fires `call_started`,
   `call_ended`, and `call_analyzed` webhooks at `/api/retell/events`, which
   store the transcript (roles mapped to caller/assistant), duration, recording,
   disconnection reason, and the extracted fields — the dashboard looks the same
   as for local calls, plus a "via Retell" tag and the recording player.

**Fail-safes:** if registering with Retell fails (outage, bad key), the call
falls back to the local pipeline before it's ever answered. If registration
succeeds but the SIP bridge itself fails, Twilio hits the `<Dial>` action
callback (`/api/voice/dial-status`) and the call is reclaimed by the local
pipeline mid-ring — the caller never hears dead air. If Retell is selected but
not configured, calls just use the local pipeline and the Settings page shows
what's missing.

**Publicly exposed paths:** if you front the server with the cloudflared
allowlist ingress (`cloudflared/config.yml`), note that `/api/retell/inbound`
and `/api/retell/events` must be in the allowlist — they're called by Retell's
cloud. `/api/retell/provision` must NOT be (it's a dashboard action).

Webhooks are verified against `x-retell-signature` (HMAC-SHA256 keyed by the
API key, 5-minute freshness window) and are idempotent — Retell retries
deliveries, and replays converge on the same database state. SMS/MMS is
untouched: it stays on the existing `/api/sms/incoming` Twilio webhook.

## Alternative: elastic SIP trunking (optional, advanced)

The default dial-to-SIP mode above keeps the number in Twilio and makes the
provider switch instant, at the cost of Twilio per-minute charges on top of
Retell's. If you'd rather import the number into Retell via elastic SIP
trunking (Retell's recommended telephony for permanent setups):

1. Twilio Console → Elastic SIP Trunking → create a trunk with the origination
   URI Retell's *Connect to your number* dialog shows.
2. Point the number's **Voice Configuration** at the trunk (SMS webhook stays).
3. Retell → Phone Numbers → add the number, and set its **inbound webhook** to
   `https://<PUBLIC_HOST>/api/retell/inbound` — that endpoint enforces the
   blocked-numbers list and tags calls with a local id (calls are declined if
   it's unreachable).
4. Rollback = repoint the number's Voice Configuration back to
   `https://<PUBLIC_HOST>/api/voice/incoming` (POST).

In this mode the `VOICE_PROVIDER` switch no longer controls routing (the number
bypasses this app's voice webhook entirely) — routing lives in the Twilio
console.

## Security notes

- The Retell API key lives **only** in `.env.local` (gitignored). It is never
  sent to the browser, logged, or stored in the database; the Settings page
  shows only configured/not-configured booleans.
- Webhook signature validation fails closed. `RETELL_SKIP_VALIDATION=true` is
  for local development only and the Settings page warns when it's on.
- Webhook bodies (caller numbers, transcripts) are never logged — log lines
  carry only the event type and local call id.
- Recording links are hosted by Retell and can expire; the Retell dashboard
  keeps the archive.

## Tests

`npm run test:retell` — signature rejection, blocked-caller rejection, inbound
metadata, duplicate webhook deliveries, transcript role mapping, analysis
mapping, and the live provider switch (Retell handoff, fallback, and both
directions of the toggle) against the local dev database.
