import { spawn } from "node:child_process"
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { config } from "../config"
import { resamplePcm16 } from "../audio/mulaw"
import { encodeWav } from "../audio/wav"

// whisper.cpp wants 16 kHz mono PCM WAV.
const WHISPER_RATE = 16000

export async function transcribeWhisper(pcm: Int16Array, sampleRate: number): Promise<string> {
  const resampled = resamplePcm16(pcm, sampleRate, WHISPER_RATE)
  const wav = encodeWav(resampled, WHISPER_RATE)

  const dir = await mkdtemp(join(tmpdir(), "hapv-stt-"))
  const wavPath = join(dir, "in.wav")
  const outPrefix = join(dir, "out")
  await writeFile(wavPath, wav)

  try {
    await runWhisper(wavPath, outPrefix)
    const txt = await readFile(`${outPrefix}.txt`, "utf8").catch(() => "")
    return cleanTranscript(txt)
  } finally {
    rm(dir, { recursive: true, force: true }).catch(() => {})
  }
}

function runWhisper(wavPath: string, outPrefix: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const args = [
      "-m", config.stt.whisperModel,
      "-f", wavPath,
      "-l", "en",
      "-otxt",
      "-of", outPrefix,
      "-nt", // no timestamps
      "-t", "4",
    ]
    const proc = spawn(config.stt.whisperCli, args, { stdio: ["ignore", "ignore", "pipe"] })
    let stderr = ""
    proc.stderr.on("data", (d) => (stderr += d.toString()))
    proc.on("error", reject)
    proc.on("close", (code) => {
      if (code === 0) resolve()
      else reject(new Error(`whisper-cli exited ${code}: ${stderr.slice(-400)}`))
    })
  })
}

function cleanTranscript(raw: string): string {
  // whisper emits bracketed non-speech tokens like [BLANK_AUDIO], (wind blowing) — drop them.
  return raw
    .replace(/\[[^\]]*\]/g, " ")
    .replace(/\((?:[^)]*)\)/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}
