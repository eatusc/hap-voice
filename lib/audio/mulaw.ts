// Home-grown G.711 µ-law codec — the audio format Twilio Media Streams use
// (8 kHz, mono, 8-bit µ-law). No dependencies.

const MULAW_BIAS = 0x84 // 132
const MULAW_CLIP = 32635

/** Encode one 16-bit PCM sample to an 8-bit µ-law byte. */
export function pcm16ToMulawSample(sample: number): number {
  const sign = (sample >> 8) & 0x80
  if (sign !== 0) sample = -sample
  if (sample > MULAW_CLIP) sample = MULAW_CLIP
  sample += MULAW_BIAS

  let exponent = 7
  for (let mask = 0x4000; (sample & mask) === 0 && exponent > 0; exponent--, mask >>= 1) {
    /* find exponent */
  }
  const mantissa = (sample >> (exponent + 3)) & 0x0f
  const mulaw = ~(sign | (exponent << 4) | mantissa)
  return mulaw & 0xff
}

/** Decode one 8-bit µ-law byte to a 16-bit PCM sample. */
export function mulawToPcm16Sample(mulaw: number): number {
  mulaw = ~mulaw & 0xff
  const sign = mulaw & 0x80
  const exponent = (mulaw >> 4) & 0x07
  const mantissa = mulaw & 0x0f
  let sample = ((mantissa << 3) + MULAW_BIAS) << exponent
  sample -= MULAW_BIAS
  return sign !== 0 ? -sample : sample
}

/** Decode a µ-law buffer to Int16 PCM samples. */
export function mulawToPcm16(mulaw: Buffer): Int16Array {
  const out = new Int16Array(mulaw.length)
  for (let i = 0; i < mulaw.length; i++) out[i] = mulawToPcm16Sample(mulaw[i])
  return out
}

/** Encode Int16 PCM samples to a µ-law buffer. */
export function pcm16ToMulaw(pcm: Int16Array): Buffer {
  const out = Buffer.alloc(pcm.length)
  for (let i = 0; i < pcm.length; i++) out[i] = pcm16ToMulawSample(pcm[i])
  return out
}

/** Naive linear resample of Int16 PCM from srcRate to dstRate. Fine for speech. */
export function resamplePcm16(pcm: Int16Array, srcRate: number, dstRate: number): Int16Array {
  if (srcRate === dstRate) return pcm
  const ratio = dstRate / srcRate
  const outLen = Math.floor(pcm.length * ratio)
  const out = new Int16Array(outLen)
  for (let i = 0; i < outLen; i++) {
    const srcPos = i / ratio
    const idx = Math.floor(srcPos)
    const frac = srcPos - idx
    const a = pcm[idx] ?? 0
    const b = pcm[idx + 1] ?? a
    out[i] = Math.round(a + (b - a) * frac)
  }
  return out
}
