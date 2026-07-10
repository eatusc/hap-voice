import { spawn } from "node:child_process"
import { mkdtemp, readFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { config } from "../config"
import { decodeWav } from "../audio/wav"
import { resamplePcm16 } from "../audio/mulaw"

// macOS built-in `say`. Free, local, good enough for dev. macOS only.
export async function synthesizeSay(text: string): Promise<Int16Array> {
  const dir = await mkdtemp(join(tmpdir(), "hapv-tts-"))
  const outPath = join(dir, "out.wav")
  try {
    await runSay(text, outPath)
    const wav = await readFile(outPath)
    const { pcm, sampleRate } = decodeWav(wav)
    return resamplePcm16(pcm, sampleRate, 8000)
  } finally {
    rm(dir, { recursive: true, force: true }).catch(() => {})
  }
}

function runSay(text: string, outPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const args = [
      "-v", config.tts.sayVoice,
      "-o", outPath,
      "--file-format=WAVE",
      "--data-format=LEI16@8000",
      text,
    ]
    const proc = spawn("/usr/bin/say", args, { stdio: ["ignore", "ignore", "pipe"] })
    let stderr = ""
    proc.stderr.on("data", (d) => (stderr += d.toString()))
    proc.on("error", reject)
    proc.on("close", (code) => {
      if (code === 0) resolve()
      else reject(new Error(`say exited ${code}: ${stderr.slice(-200)}`))
    })
  })
}
