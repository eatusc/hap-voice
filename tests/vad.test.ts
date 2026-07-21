import { describe, expect, it } from "vitest"
import { Vad } from "../lib/audio/vad"

const FRAME = 160 // 20ms at 8 kHz

function loudFrame(amplitude = 1000): Int16Array {
  return new Int16Array(FRAME).fill(amplitude) // RMS == amplitude
}

function quietFrame(): Int16Array {
  return new Int16Array(FRAME) // RMS 0
}

interface Capture {
  starts: number
  utterances: Int16Array[]
}

function wire(vad: Vad): Capture {
  const cap: Capture = { starts: 0, utterances: [] }
  vad.onSpeechStart = () => cap.starts++
  vad.onUtterance = (pcm) => cap.utterances.push(pcm)
  return cap
}

describe("Vad", () => {
  it("declares speech only after the hysteresis frame count", () => {
    const vad = new Vad({ startFrames: 3, preRollMs: 0 })
    const cap = wire(vad)

    vad.push(loudFrame())
    vad.push(loudFrame())
    expect(cap.starts).toBe(0)
    expect(vad.speaking).toBe(false)

    vad.push(loudFrame())
    expect(cap.starts).toBe(1)
    expect(vad.speaking).toBe(true)
  })

  it("does not open an utterance for isolated bursts below the hysteresis", () => {
    const vad = new Vad({ startFrames: 3, preRollMs: 0 })
    const cap = wire(vad)

    // loud, quiet, loud, quiet... never 3 in a row.
    for (let i = 0; i < 10; i++) {
      vad.push(loudFrame())
      vad.push(quietFrame())
    }
    expect(cap.starts).toBe(0)
    expect(vad.speaking).toBe(false)
  })

  it("includes pre-roll audio so the first syllable is not clipped", () => {
    // 100ms pre-roll = 5 frames; speech starts on the 3rd voiced frame, so the
    // pre-roll window holds [quiet, quiet, loud, loud, loud] at that moment.
    const vad = new Vad({ startFrames: 3, preRollMs: 100, endSilenceMs: 100 })
    const cap = wire(vad)

    for (let i = 0; i < 5; i++) vad.push(quietFrame())
    for (let i = 0; i < 3; i++) vad.push(loudFrame())
    expect(cap.starts).toBe(1)
    for (let i = 0; i < 5; i++) vad.push(quietFrame()) // 100ms silence ends it

    expect(cap.utterances).toHaveLength(1)
    const utt = cap.utterances[0]
    // 5 pre-roll frames + 5 trailing-silence frames = 10 frames.
    expect(utt.length).toBe(10 * FRAME)
    // The first two pre-roll frames are the quiet audio before speech onset.
    expect(utt[0]).toBe(0)
    expect(utt[2 * FRAME - 1]).toBe(0)
    // Then the voiced frames that triggered the start.
    expect(utt[2 * FRAME]).toBe(1000)
    expect(utt[5 * FRAME - 1]).toBe(1000)
  })

  it("ends the utterance after the configured trailing silence", () => {
    const vad = new Vad({ startFrames: 3, preRollMs: 0, endSilenceMs: 100 })
    const cap = wire(vad)

    for (let i = 0; i < 5; i++) vad.push(loudFrame())
    // 4 quiet frames (80ms) is not enough...
    for (let i = 0; i < 4; i++) vad.push(quietFrame())
    expect(cap.utterances).toHaveLength(0)
    expect(vad.speaking).toBe(true)
    // ...the 5th (100ms) closes it.
    vad.push(quietFrame())
    expect(cap.utterances).toHaveLength(1)
    expect(vad.speaking).toBe(false)
    // 2 voiced frames after the start + 5 silence frames (pre-roll disabled, so
    // the utterance holds the frames pushed after speech was declared).
    expect(cap.utterances[0].length).toBe(7 * FRAME)
  })

  it("caps a runaway utterance at maxUtteranceMs even with no silence", () => {
    const vad = new Vad({ startFrames: 3, preRollMs: 0, endSilenceMs: 10000, maxUtteranceMs: 200 })
    const cap = wire(vad)

    // 200ms cap = 10 accumulated frames after the start.
    for (let i = 0; i < 13; i++) vad.push(loudFrame())
    expect(cap.utterances).toHaveLength(1)
    expect(cap.utterances[0].length).toBe(10 * FRAME)
    expect(vad.speaking).toBe(false)
  })

  it("re-chunks arbitrary push sizes into frames", () => {
    const vad = new Vad({ startFrames: 3, preRollMs: 0, endSilenceMs: 100 })
    const cap = wire(vad)

    // One big buffer: 5 loud frames + 5 quiet frames in a single push.
    const buf = new Int16Array(10 * FRAME)
    buf.fill(1000, 0, 5 * FRAME)
    vad.push(buf)
    expect(cap.starts).toBe(1)
    expect(cap.utterances).toHaveLength(1)
  })

  it("flush() emits an in-progress utterance (e.g. on call end)", () => {
    const vad = new Vad({ startFrames: 3, preRollMs: 0 })
    const cap = wire(vad)

    for (let i = 0; i < 5; i++) vad.push(loudFrame())
    expect(cap.utterances).toHaveLength(0)
    vad.flush()
    expect(cap.utterances).toHaveLength(1)
    expect(vad.speaking).toBe(false)
  })

  it("reset() drops buffered state without emitting", () => {
    const vad = new Vad({ startFrames: 3, preRollMs: 0 })
    const cap = wire(vad)

    for (let i = 0; i < 5; i++) vad.push(loudFrame())
    vad.reset()
    expect(cap.utterances).toHaveLength(0)
    expect(vad.speaking).toBe(false)
  })
})
