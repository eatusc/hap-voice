import { config } from "../config"
import { getSettings } from "../settings"
import { decodeWav } from "../audio/wav"
import { resamplePcm16 } from "../audio/mulaw"

// Kokoro — free, local neural TTS (near-ElevenLabs naturalness). Talks to the
// persistent Python service (kokoro/server.py, run under launchd) which keeps the
// model loaded, so synthesis stays ~0.5s. Returns 24 kHz WAV; we resample to 8 kHz.
export async function synthesizeKokoro(text: string): Promise<Int16Array> {
  const s = await getSettings()
  const res = await fetch(`${config.tts.kokoroUrl}/tts`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text, voice: s.kokoroVoice, speed: s.ttsSpeed }),
  })
  if (!res.ok) {
    throw new Error(`Kokoro ${res.status}: ${(await res.text()).slice(0, 200)}`)
  }
  const wav = Buffer.from(await res.arrayBuffer())
  const { pcm, sampleRate } = decodeWav(wav)
  return resamplePcm16(pcm, sampleRate, 8000)
}
