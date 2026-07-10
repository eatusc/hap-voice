// Minimal WAV (PCM 16-bit mono) reader/writer. No dependencies.

export function encodeWav(pcm: Int16Array, sampleRate: number): Buffer {
  const dataBytes = pcm.length * 2
  const buf = Buffer.alloc(44 + dataBytes)
  buf.write("RIFF", 0)
  buf.writeUInt32LE(36 + dataBytes, 4)
  buf.write("WAVE", 8)
  buf.write("fmt ", 12)
  buf.writeUInt32LE(16, 16) // PCM chunk size
  buf.writeUInt16LE(1, 20) // audio format = PCM
  buf.writeUInt16LE(1, 22) // channels = mono
  buf.writeUInt32LE(sampleRate, 24)
  buf.writeUInt32LE(sampleRate * 2, 28) // byte rate
  buf.writeUInt16LE(2, 32) // block align
  buf.writeUInt16LE(16, 34) // bits per sample
  buf.write("data", 36)
  buf.writeUInt32LE(dataBytes, 40)
  for (let i = 0; i < pcm.length; i++) buf.writeInt16LE(pcm[i], 44 + i * 2)
  return buf
}

/** Read a PCM16 mono/stereo WAV. Returns first channel + sample rate. */
export function decodeWav(buf: Buffer): { pcm: Int16Array; sampleRate: number } {
  if (buf.toString("ascii", 0, 4) !== "RIFF") throw new Error("Not a WAV file")

  let offset = 12
  let sampleRate = 8000
  let channels = 1
  let bitsPerSample = 16
  let dataOffset = -1
  let dataLen = 0

  while (offset + 8 <= buf.length) {
    const id = buf.toString("ascii", offset, offset + 4)
    const size = buf.readUInt32LE(offset + 4)
    if (id === "fmt ") {
      channels = buf.readUInt16LE(offset + 10)
      sampleRate = buf.readUInt32LE(offset + 12)
      bitsPerSample = buf.readUInt16LE(offset + 22)
    } else if (id === "data") {
      dataOffset = offset + 8
      dataLen = size
    }
    offset += 8 + size + (size % 2)
  }

  if (dataOffset < 0) throw new Error("WAV has no data chunk")
  if (bitsPerSample !== 16) throw new Error(`Unsupported bits/sample: ${bitsPerSample}`)

  const totalSamples = Math.floor(dataLen / 2)
  const all = new Int16Array(totalSamples)
  for (let i = 0; i < totalSamples; i++) all[i] = buf.readInt16LE(dataOffset + i * 2)

  if (channels === 1) return { pcm: all, sampleRate }

  // Downmix to mono (take channel 0).
  const mono = new Int16Array(Math.floor(totalSamples / channels))
  for (let i = 0; i < mono.length; i++) mono[i] = all[i * channels]
  return { pcm: mono, sampleRate }
}
