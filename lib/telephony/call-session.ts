import { Vad } from "../audio/vad"
import { mulawToPcm16, pcm16ToMulaw } from "../audio/mulaw"
import { getStt } from "../stt"
import { getTts } from "../tts"
import {
  type ChatMessage,
  generateReply,
  extractCallDetails,
  scoreSpam,
} from "../llm/openrouter"
import { config } from "../config"
import { getSettings } from "../settings"
import {
  addTurn,
  getTurns,
  queryOne,
  updateCall,
  type Call,
} from "../db"
import {
  clearMessage,
  markMessage,
  mediaMessage,
  type TwilioInbound,
} from "./twilio-stream"

export interface Transport {
  send(text: string): void
  close?(): void
}

const MULAW_CHUNK = 3200 // ~400ms of 8kHz µ-law per media message

export class CallSession {
  private vad = new Vad({ sampleRate: 8000, endSilenceMs: 800 })
  private stt = getStt()
  private tts = getTts()

  private streamSid = ""
  private callId: number | null = null
  private fromNumber = "unknown"
  private startedAtMs = Date.now()

  private history: ChatMessage[] = []
  private assistantSpeaking = false
  private currentMark = ""
  private turnBusy = false
  private pendingUtterances: Int16Array[] = []
  private finalized = false
  private responseSeq = 0
  // Cancels the in-flight turn's LLM + TTS work when the caller barges in, so a
  // stale reply can't finish generating and get spoken over the new turn.
  private currentTurnAbort: AbortController | null = null

  constructor(private transport: Transport) {
    this.vad.onSpeechStart = () => this.onCallerSpeechStart()
    this.vad.onUtterance = (pcm) => this.onUtterance(pcm)
  }

  private log(...args: any[]) {
    console.log(`[call ${this.callId ?? "?"}]`, ...args)
  }

  // ─── Inbound message router ───────────────────────────────────────────────

  async handleMessage(raw: string) {
    let msg: TwilioInbound
    try {
      msg = JSON.parse(raw)
    } catch {
      return
    }

    switch (msg.event) {
      case "start":
        await this.onStart(msg)
        break
      case "media":
        this.onMedia(msg.media.payload)
        break
      case "mark":
        if (msg.mark.name === this.currentMark) this.assistantSpeaking = false
        break
      case "stop":
        await this.finalize()
        break
    }
  }

  private async onStart(msg: Extract<TwilioInbound, { event: "start" }>) {
    const sttPrepareStarted = Date.now()
    const sttReady = this.stt.prepare?.().catch((err) => {
      this.log("STT warm-up error:", (err as Error).message)
    })

    this.streamSid = msg.start.streamSid
    const params = msg.start.customParameters ?? {}
    this.fromNumber = params.from ?? "unknown"

    // Streams must reference a live call created by the signature-validated
    // voice webhook (its TwiML always passes callId). The /media endpoint is
    // public, so anything without that handle is rejected before it can burn
    // STT/LLM/TTS resources.
    if (params.callId) {
      const existing = await queryOne<Call>(
        `SELECT * FROM calls WHERE id = $1 AND status = 'in_progress'`,
        [Number(params.callId)],
      )
      if (existing) {
        this.callId = existing.id
        this.fromNumber = existing.from_number
      }
    }
    if (this.callId == null) {
      console.warn("[media ws] rejected stream without a valid in-progress callId")
      this.finalized = true // nothing to record; skip finalize work on close
      this.transport.close?.()
      return
    }
    await updateCall(this.callId, { stream_sid: this.streamSid })

    this.startedAtMs = Date.now()
    this.log("started, from", this.fromNumber)
    await this.speak((await getSettings()).greeting, /* record */ true)
    if (sttReady) {
      await sttReady
      this.log(`STT ready in ${Date.now() - sttPrepareStarted}ms`)
    }
  }

  private onMedia(payloadB64: string) {
    const mulaw = Buffer.from(payloadB64, "base64")
    const pcm = mulawToPcm16(mulaw)
    this.vad.push(pcm)
  }

  // ─── Barge-in ─────────────────────────────────────────────────────────────

  private onCallerSpeechStart() {
    // Cancel any in-flight LLM/TTS work first — whether or not audio is already
    // playing, the caller has moved on, so a reply still being generated must
    // not be spoken. The turn's post-await guards drop it once aborted.
    this.currentTurnAbort?.abort()

    if (this.assistantSpeaking) {
      this.log("barge-in — caller interrupted")
      this.transport.send(clearMessage(this.streamSid))
      this.assistantSpeaking = false
      this.currentMark = ""
    }
  }

  // ─── Turn handling ────────────────────────────────────────────────────────

  private onUtterance(pcm: Int16Array) {
    // Serialize turns: if we're mid-turn, buffer everything the caller says so the
    // next turn transcribes all of it — never drop what they told us.
    if (this.turnBusy) {
      this.pendingUtterances.push(pcm)
      return
    }
    void this.processTurn(pcm)
  }

  private drainPending(): Int16Array | null {
    if (this.pendingUtterances.length === 0) return null
    const total = this.pendingUtterances.reduce((n, u) => n + u.length, 0)
    const merged = new Int16Array(total)
    let o = 0
    for (const u of this.pendingUtterances) {
      merged.set(u, o)
      o += u.length
    }
    this.pendingUtterances = []
    return merged
  }

  private async processTurn(pcm: Int16Array) {
    this.turnBusy = true
    const abort = new AbortController()
    this.currentTurnAbort = abort
    const turnStarted = Date.now()
    try {
      const sttStarted = Date.now()
      const text = (await this.stt.transcribe(pcm, 8000)).trim()
      const sttMs = Date.now() - sttStarted
      if (!text) {
        this.log(`empty transcription, ignoring (STT ${sttMs}ms)`)
        return
      }
      this.log(`caller (STT ${sttMs}ms):`, text)
      await this.recordTurn("caller", text)
      this.history.push({ role: "user", content: text })

      let reply: string
      const llmStarted = Date.now()
      try {
        reply = await generateReply(this.history, {}, abort.signal)
      } catch (err) {
        // A barge-in aborts the request — that's expected, not an error, and the
        // guard below drops the turn without logging a spurious failure.
        if (abort.signal.aborted) return
        this.log("LLM error:", (err as Error).message)
        reply = "Sorry, I'm having trouble hearing you. Could you say that again?"
      }
      // Caller interrupted while we were generating — abandon this reply so it
      // never lands on top of the new turn.
      if (abort.signal.aborted) return
      const llmMs = Date.now() - llmStarted
      if (!reply) reply = "Could you repeat that?"

      this.log(`assistant (LLM ${llmMs}ms):`, reply)
      // Commit the reply to history only if it was actually spoken — a barge-in
      // mid-synthesis drops it, so the transcript can't show a reply the caller
      // never heard (which would also mislead the next turn's context).
      const spoke = await this.speak(reply, true, abort.signal)
      if (spoke) this.history.push({ role: "assistant", content: reply })
      this.log(`turn ready in ${Date.now() - turnStarted}ms`)
    } catch (err) {
      this.log("turn error:", (err as Error).message)
    } finally {
      this.turnBusy = false
      if (this.currentTurnAbort === abort) this.currentTurnAbort = null
      // Drain anything the caller said while we worked, as one combined turn.
      const next = this.drainPending()
      if (next) void this.processTurn(next)
    }
  }

  // ─── Speaking ─────────────────────────────────────────────────────────────

  // Returns true if the audio was actually sent, false if it was dropped
  // (aborted by a barge-in, or TTS failed). Records the turn only when spoken.
  private async speak(text: string, record: boolean, signal?: AbortSignal): Promise<boolean> {
    if (signal?.aborted) return false
    let pcm: Int16Array
    const ttsStarted = Date.now()
    try {
      pcm = await this.tts.synthesize(text, signal)
    } catch (err) {
      if (signal?.aborted) return false
      this.log("TTS error:", (err as Error).message)
      return false
    }
    // Caller barged in while we were synthesizing — don't send stale audio.
    if (signal?.aborted) return false
    this.log(`TTS synthesized in ${Date.now() - ttsStarted}ms`)
    if (record) await this.recordTurn("assistant", text)
    this.sendAudio(pcm)
    return true
  }

  private sendAudio(pcm8k: Int16Array) {
    const mulaw = pcm16ToMulaw(pcm8k)
    for (let off = 0; off < mulaw.length; off += MULAW_CHUNK) {
      const chunk = mulaw.subarray(off, off + MULAW_CHUNK)
      this.transport.send(mediaMessage(this.streamSid, chunk.toString("base64")))
    }
    this.currentMark = `resp-${++this.responseSeq}`
    this.assistantSpeaking = true
    this.transport.send(markMessage(this.streamSid, this.currentMark))
  }

  private async recordTurn(role: "caller" | "assistant", text: string) {
    if (this.callId == null) return
    try {
      await addTurn(this.callId, role, text)
    } catch (err) {
      this.log("addTurn error:", (err as Error).message)
    }
  }

  // ─── Finalize ─────────────────────────────────────────────────────────────

  async finalize() {
    if (this.finalized || this.callId == null) return
    this.finalized = true
    this.vad.flush()

    const durationSeconds = Math.round((Date.now() - this.startedAtMs) / 1000)
    this.log("ended, duration", durationSeconds, "s")

    const turns = await getTurns(this.callId)
    const transcript = turns
      .map((t) => `${t.role === "caller" ? "Caller" : "Assistant"}: ${t.text}`)
      .join("\n")

    const patch: Partial<Call> = {
      status: "completed",
      ended_at: new Date().toISOString(),
      duration_seconds: durationSeconds,
    }

    if (transcript && config.llm.apiKey) {
      try {
        const [details, spam] = await Promise.all([
          extractCallDetails(transcript),
          scoreSpam(transcript, this.fromNumber),
        ])
        Object.assign(patch, {
          caller_name: details.caller_name,
          caller_company: details.caller_company,
          caller_email: details.caller_email,
          reason: details.reason,
          callback_number: details.callback_number,
          message: details.message,
          summary: details.summary,
          spam_score: spam.spam_score,
          spam_reason: spam.spam_reason,
          is_spam: spam.is_spam,
        })
      } catch (err) {
        this.log("analysis error:", (err as Error).message)
      }
    }

    await updateCall(this.callId, patch)
    this.log("finalized")
  }
}
