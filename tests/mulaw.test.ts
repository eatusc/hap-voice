import { describe, expect, it } from "vitest"
import {
  mulawToPcm16,
  mulawToPcm16Sample,
  pcm16ToMulaw,
  pcm16ToMulawSample,
  resamplePcm16,
} from "../lib/audio/mulaw"

describe("µ-law codec", () => {
  it("matches known G.711 vectors", () => {
    // Silence encodes to 0xFF, the canonical µ-law zero.
    expect(pcm16ToMulawSample(0)).toBe(0xff)
    expect(mulawToPcm16Sample(0xff)).toBe(0)
    // 0x7F is "negative zero"; it also decodes to 0 (as JS -0).
    expect(mulawToPcm16Sample(0x7f) === 0).toBe(true)
    // Full-scale positive clips to the top segment (0x80 -> 32124).
    expect(pcm16ToMulawSample(32635)).toBe(0x80)
    expect(pcm16ToMulawSample(32767)).toBe(0x80) // clipped to the same code
    expect(mulawToPcm16Sample(0x80)).toBe(32124)
    // Full-scale negative mirrors it (0x00 -> -32124).
    expect(pcm16ToMulawSample(-32635)).toBe(0x00)
    expect(mulawToPcm16Sample(0x00)).toBe(-32124)
  })

  it("round-trips samples within µ-law quantization error", () => {
    const samples = [
      0, 1, -1, 7, -7, 50, -50, 200, -200, 1000, -1000, 5000, -5000, 15000,
      -15000, 30000, -30000, 32124, -32124,
    ]
    for (const x of samples) {
      const decoded = mulawToPcm16Sample(pcm16ToMulawSample(x))
      // Half a quantization step: at most 4 in the lowest segment, ~4% of the
      // magnitude in the logarithmic segments.
      const tolerance = Math.max(8, Math.abs(x) * 0.05)
      expect(Math.abs(decoded - x), `sample ${x} -> ${decoded}`).toBeLessThanOrEqual(tolerance)
    }
  })

  it("decode(encode(byte)) is stable for every µ-law code", () => {
    // Encoding a decoded value must give back the same byte (codec idempotence),
    // except that 0x7F and 0xFF are both "zero" and canonicalize to 0xFF.
    for (let byte = 0; byte < 256; byte++) {
      const reencoded = pcm16ToMulawSample(mulawToPcm16Sample(byte))
      const expected = byte === 0x7f ? 0xff : byte
      expect(reencoded, `byte 0x${byte.toString(16)}`).toBe(expected)
    }
  })

  it("round-trips buffers through the array helpers", () => {
    const pcm = new Int16Array([0, 1000, -1000, 30000, -30000, 12345, -12345])
    const encoded = pcm16ToMulaw(pcm)
    expect(encoded.length).toBe(pcm.length)
    const decoded = mulawToPcm16(encoded)
    expect(decoded.length).toBe(pcm.length)
    for (let i = 0; i < pcm.length; i++) {
      const tolerance = Math.max(8, Math.abs(pcm[i]) * 0.05)
      expect(Math.abs(decoded[i] - pcm[i])).toBeLessThanOrEqual(tolerance)
    }
  })
})

describe("resamplePcm16", () => {
  it("returns the input unchanged when rates match", () => {
    const pcm = new Int16Array([1, 2, 3, 4])
    expect(resamplePcm16(pcm, 8000, 8000)).toBe(pcm)
  })

  it("produces floor(length * ratio) samples", () => {
    const pcm = new Int16Array(8000) // 1s at 8 kHz
    expect(resamplePcm16(pcm, 8000, 16000).length).toBe(16000)
    expect(resamplePcm16(pcm, 8000, 24000).length).toBe(24000)
    const pcm16k = new Int16Array(16000)
    expect(resamplePcm16(pcm16k, 16000, 8000).length).toBe(8000)
    const odd = new Int16Array(3)
    expect(resamplePcm16(odd, 16000, 8000).length).toBe(1)
  })

  it("preserves a constant signal when upsampling", () => {
    const pcm = new Int16Array(100).fill(1234)
    const out = resamplePcm16(pcm, 8000, 16000)
    expect(out.length).toBe(200)
    for (const s of out) expect(s).toBe(1234)
  })

  it("interpolates linearly between samples", () => {
    const pcm = new Int16Array([0, 100])
    const out = resamplePcm16(pcm, 8000, 16000)
    // Positions 0, 0.5, 1, 1.5 -> 0, 50, 100, 100 (last sample held).
    expect(Array.from(out)).toEqual([0, 50, 100, 100])
  })
})
