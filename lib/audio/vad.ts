// Home-grown energy-based Voice Activity Detector.
//
// Fed 20ms PCM16 frames (8 kHz mono). It decides when the caller is speaking,
// buffers a full utterance, and fires `onUtterance` once the caller goes quiet.
// It also exposes `speaking` so the call session can detect barge-in while the
// assistant is talking.

export interface VadOptions {
  sampleRate?: number
  frameMs?: number
  /** RMS energy above which a frame counts as speech. */
  energyThreshold?: number
  /** Consecutive voiced frames required to declare speech started. */
  startFrames?: number
  /** Trailing silence (ms) that ends an utterance. */
  endSilenceMs?: number
  /** Hard cap on a single utterance (ms). */
  maxUtteranceMs?: number
  /** Audio kept before speech onset so we don't clip the first syllable (ms). */
  preRollMs?: number
}

export class Vad {
  private sampleRate: number
  private frameSamples: number
  private energyThreshold: number
  private startFrames: number
  private endSilenceFrames: number
  private maxUtteranceFrames: number
  private preRollFrames: number

  private inSpeech = false
  private voicedRun = 0
  private silenceRun = 0
  private utterance: Int16Array[] = []
  private preRoll: Int16Array[] = []
  private frameCount = 0

  onSpeechStart?: () => void
  /** Fires with the utterance PCM16 (8 kHz) when the caller finishes speaking. */
  onUtterance?: (pcm: Int16Array) => void

  constructor(opts: VadOptions = {}) {
    this.sampleRate = opts.sampleRate ?? 8000
    const frameMs = opts.frameMs ?? 20
    this.frameSamples = Math.round((this.sampleRate * frameMs) / 1000)
    this.energyThreshold = opts.energyThreshold ?? 500
    this.startFrames = opts.startFrames ?? 3
    this.endSilenceFrames = Math.round((opts.endSilenceMs ?? 800) / frameMs)
    this.maxUtteranceFrames = Math.round((opts.maxUtteranceMs ?? 15000) / frameMs)
    this.preRollFrames = Math.round((opts.preRollMs ?? 240) / frameMs)
  }

  get speaking(): boolean {
    return this.inSpeech
  }

  private rms(frame: Int16Array): number {
    let sum = 0
    for (let i = 0; i < frame.length; i++) sum += frame[i] * frame[i]
    return Math.sqrt(sum / frame.length)
  }

  /** Push a PCM16 frame (any length; it's chunked to the configured frame size). */
  push(pcm: Int16Array) {
    // Re-chunk arbitrary input into fixed frames.
    for (let off = 0; off < pcm.length; off += this.frameSamples) {
      const frame = pcm.subarray(off, off + this.frameSamples)
      if (frame.length === this.frameSamples) this.pushFrame(frame)
    }
  }

  private pushFrame(frame: Int16Array) {
    this.frameCount++
    const voiced = this.rms(frame) >= this.energyThreshold

    if (!this.inSpeech) {
      // Keep a rolling pre-roll buffer.
      this.preRoll.push(frame.slice())
      if (this.preRoll.length > this.preRollFrames) this.preRoll.shift()

      if (voiced) {
        this.voicedRun++
        if (this.voicedRun >= this.startFrames) {
          this.inSpeech = true
          this.silenceRun = 0
          this.utterance = [...this.preRoll]
          this.preRoll = []
          this.onSpeechStart?.()
        }
      } else {
        this.voicedRun = 0
      }
      return
    }

    // In speech: accumulate.
    this.utterance.push(frame.slice())
    if (voiced) {
      this.silenceRun = 0
    } else {
      this.silenceRun++
    }

    const tooLong = this.utterance.length >= this.maxUtteranceFrames
    if (this.silenceRun >= this.endSilenceFrames || tooLong) {
      this.finishUtterance()
    }
  }

  private finishUtterance() {
    const total = this.utterance.reduce((n, f) => n + f.length, 0)
    const merged = new Int16Array(total)
    let o = 0
    for (const f of this.utterance) {
      merged.set(f, o)
      o += f.length
    }
    this.inSpeech = false
    this.voicedRun = 0
    this.silenceRun = 0
    this.utterance = []
    if (merged.length > 0) this.onUtterance?.(merged)
  }

  /** Force-flush any in-progress utterance (e.g. on call end). */
  flush() {
    if (this.inSpeech && this.utterance.length > 0) this.finishUtterance()
  }

  reset() {
    this.inSpeech = false
    this.voicedRun = 0
    this.silenceRun = 0
    this.utterance = []
    this.preRoll = []
  }
}
