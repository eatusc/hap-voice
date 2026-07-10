// Local end-to-end test of the call pipeline — no Twilio, no phone.
//
// Feeds a WAV of "caller" speech into a real CallSession as if it were a Twilio
// Media Stream, runs VAD → whisper STT → OpenRouter → TTS, captures the
// assistant's spoken reply to sim-out/, and prints the resulting DB row.
//
//   npx tsx scripts/simulate-call.ts                 # generates a caller line via `say`
//   npx tsx scripts/simulate-call.ts caller.wav      # use your own recording
//   npx tsx scripts/simulate-call.ts caller.wav --from +14155551234

import "../lib/load-env" // must be first — populates process.env before config is read
import { spawnSync } from "node:child_process"
import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { pool, getTurns, queryOne, type Call } from "../lib/db"
import { CallSession, type Transport } from "../lib/telephony/call-session"
import { decodeWav, encodeWav } from "../lib/audio/wav"
import { mulawToPcm16, pcm16ToMulaw, resamplePcm16 } from "../lib/audio/mulaw"
import { mediaMessage } from "../lib/telephony/twilio-stream"

const DEFAULT_LINE =
  "Hi, this is Alex from Acme Software. I'd like to talk to someone about a product consulting project. You can reach me at 415 555 0134. Thanks!"

// Mock transport: decodes the assistant's outbound audio back into PCM so we can
// save it, and counts responses via `mark` messages.
class MockTransport implements Transport {
  responses: Int16Array[] = []
  private current: number[] = []
  /** Echoes Twilio's `mark` acknowledgement back to the session, like a real call. */
  echoMark?: (name: string) => void

  send(text: string) {
    const msg = JSON.parse(text)
    if (msg.event === "media") {
      const mulaw = Buffer.from(msg.media.payload, "base64")
      const pcm = mulawToPcm16(mulaw)
      for (let i = 0; i < pcm.length; i++) this.current.push(pcm[i])
    } else if (msg.event === "mark") {
      this.responses.push(Int16Array.from(this.current))
      this.current = []
      this.echoMark?.(msg.mark.name)
    } else if (msg.event === "clear") {
      this.current = []
    }
  }
}

function frame160(pcm: Int16Array, off: number): Int16Array {
  const f = new Int16Array(160)
  f.set(pcm.subarray(off, off + 160))
  return f
}

async function main() {
  const args = process.argv.slice(2)
  const fromIdx = args.indexOf("--from")
  const from = fromIdx >= 0 ? args[fromIdx + 1] : "+14155550134"
  const wavArg = args.find((a) => a.endsWith(".wav"))

  // 1. Obtain caller audio (given WAV or generate one with `say`).
  let callerWav: Buffer
  if (wavArg) {
    callerWav = readFileSync(wavArg)
    console.log(`Using caller audio: ${wavArg}`)
  } else {
    const tmp = join(tmpdir(), `hapv-caller-${Date.now()}.wav`)
    console.log("No WAV given — generating a caller line with `say`…")
    spawnSync("/usr/bin/say", ["-o", tmp, "--file-format=WAVE", "--data-format=LEI16@8000", DEFAULT_LINE])
    callerWav = readFileSync(tmp)
  }

  const decoded = decodeWav(callerWav)
  const caller8k = resamplePcm16(decoded.pcm, decoded.sampleRate, 8000)

  // 2. Wire up a session.
  const transport = new MockTransport()
  const session = new CallSession(transport)
  const streamSid = "SIM" + Date.now()
  transport.echoMark = (name) =>
    void session.handleMessage(JSON.stringify({ event: "mark", streamSid, mark: { name } }))

  // 3. Start event → assistant greeting (response #1).
  await session.handleMessage(
    JSON.stringify({
      event: "start",
      streamSid,
      start: {
        streamSid,
        callSid: "CA-sim-" + Date.now(),
        accountSid: "AC-sim",
        tracks: ["inbound"],
        mediaFormat: { encoding: "audio/x-mulaw", sampleRate: 8000, channels: 1 },
        customParameters: { from },
      },
    }),
  )
  console.log("→ greeting spoken")

  // 4. Feed caller audio as 20ms media frames, then trailing silence to close the utterance.
  const mulaw = pcm16ToMulaw(caller8k)
  const callerPcmFramed = mulawToPcm16(mulaw)
  for (let off = 0; off < callerPcmFramed.length; off += 160) {
    const b64 = pcm16ToMulaw(frame160(callerPcmFramed, off)).toString("base64")
    void session.handleMessage(mediaMessage(streamSid, b64))
  }
  const silence = new Int16Array(160)
  for (let i = 0; i < 60; i++) {
    void session.handleMessage(mediaMessage(streamSid, pcm16ToMulaw(silence).toString("base64")))
  }
  console.log("→ caller audio fed, waiting for reply…")

  // 5. Wait for the assistant's reply (response #2).
  const deadline = Date.now() + 60000
  while (transport.responses.length < 2 && Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 200))
  }

  // 6. End the call → finalize (extraction + spam scoring).
  await session.finalize()

  // 7. Save the assistant audio and print the result.
  mkdirSync("sim-out", { recursive: true })
  transport.responses.forEach((pcm, i) => {
    writeFileSync(join("sim-out", `assistant-${i + 1}.wav`), encodeWav(pcm, 8000))
  })

  const call = await queryOne<Call>(`SELECT * FROM calls ORDER BY id DESC LIMIT 1`)
  const turns = call ? await getTurns(call.id) : []

  console.log("\n───────────── TRANSCRIPT ─────────────")
  for (const t of turns) console.log(`${t.role === "assistant" ? "Assistant" : "Caller"}: ${t.text}`)
  console.log("\n───────────── EXTRACTED ──────────────")
  if (call) {
    console.log("Name:     ", call.caller_name)
    console.log("Company:  ", call.caller_company)
    console.log("Reason:   ", call.reason)
    console.log("Callback: ", call.callback_number)
    console.log("Message:  ", call.message)
    console.log("Spam:     ", call.spam_score, call.is_spam ? "(SPAM)" : "")
  }
  console.log("\nAssistant audio written to sim-out/. Open the dashboard to see the call.")
  await pool.end()
}

main().catch((err) => {
  console.error("simulate failed:", err)
  process.exit(1)
})
