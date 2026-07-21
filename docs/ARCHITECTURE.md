# Architecture: one call's lifecycle

This walks a single phone call through the local pipeline, end to end. File
references are to the code that actually implements each step.

```
Twilio webhook ──► TwiML <Connect><Stream> ──► /media websocket
                                                   │
              ┌────────────────────────────────────┘
              ▼
  µ-law frames ──► VAD ──► whisper.cpp STT ──► OpenRouter LLM ──► TTS ──► µ-law out
                                                   │
                                       call ends ──► finalize (summary, spam score)
```

## 1. Webhook → TwiML

Twilio POSTs to `/api/voice/incoming` (`app/api/voice/incoming/route.ts`). The
handler first verifies the `X-Twilio-Signature` HMAC
(`lib/telephony/validate-signature.ts`), then checks the block list; blocked
numbers get `<Reject>` before any AI runs. Otherwise it creates a call row in
Postgres and answers with TwiML that tells Twilio to open a media websocket:

```xml
<Connect><Stream url="wss://HOST/media">
  <Parameter name="callId" value="..."/><Parameter name="from" value="..."/>
</Stream></Connect>
```

## 2. /media websocket

`server.ts` runs a custom Next server and handles the HTTP upgrade for `/media`
itself (it never goes through Next routing or the auth middleware). Each socket
gets its own `CallSession` (`lib/telephony/call-session.ts`), the per-call
orchestrator.

On the stream's `start` event the session:

- rejects the stream unless its `callId` parameter references a live
  `in_progress` call created by the signature-validated webhook (the endpoint
  is public, so unvouched streams are dropped before they can burn STT/LLM/TTS
  resources);
- warms up whisper.cpp in the background (`lib/stt/whisper.ts` runs a tiny
  transcription to pull the model into the OS file cache) while
- speaking the greeting to the caller.

Every `media` event carries ~20ms of base64 8 kHz µ-law audio. It is decoded to
PCM16 by the home-grown G.711 codec (`lib/audio/mulaw.ts`) and pushed into the
VAD.

## 3. VAD: deciding when the caller spoke

`lib/audio/vad.ts` is an energy-based voice activity detector over 20ms frames:

- **Speech start** needs 3 consecutive frames above the RMS threshold
  (hysteresis, so a click or pop does not open an utterance).
- A rolling **pre-roll** buffer (240ms) is prepended so the first syllable is
  not clipped.
- **End of utterance** is 800ms of trailing silence, with a 15s hard cap.

When an utterance completes, the buffered PCM is handed to the turn pipeline.

## 4. STT → LLM → TTS (one turn)

`CallSession.processTurn` runs the utterance through:

1. **STT**: resample 8 kHz → 16 kHz, wrap in a WAV, run `whisper-cli`
   (`lib/stt/whisper.ts`). Empty transcriptions are dropped.
2. **LLM**: `generateReply` (`lib/llm/openrouter.ts`) with the running
   conversation history and the knowledge base.
3. **TTS**: the configured provider (`say`, Piper, Kokoro, or ElevenLabs;
   `lib/tts/`) synthesizes the reply to 8 kHz PCM16.
4. The PCM is µ-law encoded and streamed back to Twilio in ~400ms chunks,
   followed by a `mark` message; Twilio echoes the mark when playback finishes,
   which is how the session knows the assistant has stopped talking.

Each stage is timed and logged per turn (`STT 412ms`, `LLM 780ms`,
`TTS synthesized in 350ms`, `turn ready in 1650ms`), so latency regressions are
visible per call in the server log.

## Barge-in: the caller can interrupt

Callers talk over receptionists, so the session treats caller speech as a
cancel signal. Each turn owns an `AbortController`, and the VAD's
`onSpeechStart` callback fires the moment the caller starts talking:

- **Abort in-flight work.** The current turn's abort signal cancels the LLM
  request and TTS synthesis (network providers pass the signal to `fetch`), so
  a stale reply stops generating instead of finishing in the background.
- **Stop audio already playing.** If the assistant is mid-sentence, the session
  sends Twilio a `clear` message, which flushes the buffered outbound audio
  immediately.
- **Only spoken replies enter history.** `speak()` returns whether the audio
  was actually sent; the reply is committed to the conversation history only in
  that case (`call-session.ts`, around lines 213-217). A reply aborted
  mid-synthesis never appears in the transcript, and, just as important, never
  misleads the next turn's LLM context with words the caller never heard.

## Turn serialization

Turns are strictly serialized. If the caller says something while a turn is
still being processed, the new utterance is not processed concurrently and not
dropped: it is buffered, and when the current turn finishes, all buffered
utterances are drained and concatenated into one combined turn. Everything the
caller said gets transcribed together, in order, with no interleaved replies.

## 5. Finalize

On the stream's `stop` event (or socket close) the session flushes any
in-progress utterance, marks the call completed with its duration, and, if an
OpenRouter key is configured, runs two LLM passes in parallel over the full
transcript: structured detail extraction (name, company, reason, callback
number, message, summary) and spam scoring. The results land on the call row
and show up in the dashboard's call detail view.
