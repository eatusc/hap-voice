import { spawn } from "node:child_process"
import { mkdtemp, readFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { config } from "../config"
import { decodeWav } from "../audio/wav"
import { resamplePcm16 } from "../audio/mulaw"

// Piper — free, local neural TTS. Portable to Linux (unlike `say`), so this is
// the recommended provider for the server. Install: see README.
export async function synthesizePiper(text: string): Promise<Int16Array> {
  const dir = await mkdtemp(join(tmpdir(), "hapv-tts-"))
  const outPath = join(dir, "out.wav")
  try {
    await runPiper(text, outPath)
    const wav = await readFile(outPath)
    const { pcm, sampleRate } = decodeWav(wav)
    return resamplePcm16(pcm, sampleRate, 8000)
  } finally {
    rm(dir, { recursive: true, force: true }).catch(() => {})
  }
}

function runPiper(text: string, outPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const args = ["--model", config.tts.piperVoice, "--output_file", outPath]
    const proc = spawn(config.tts.piperBin, args, { stdio: ["pipe", "ignore", "pipe"] })
    let stderr = ""
    proc.stderr.on("data", (d) => (stderr += d.toString()))
    proc.on("error", reject)
    proc.on("close", (code) => {
      if (code === 0) resolve()
      else reject(new Error(`piper exited ${code}: ${stderr.slice(-200)}`))
    })
    proc.stdin.write(text)
    proc.stdin.end()
  })
}
