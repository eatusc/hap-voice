import { NextResponse } from "next/server"
import { encodeWav } from "@/lib/audio/wav"
import type { AppSettings } from "@/lib/settings"
import { synthesizeElevenLabs } from "@/lib/tts/elevenlabs"
import { synthesizeKokoro } from "@/lib/tts/kokoro"
import { synthesizeSay } from "@/lib/tts/say"
import { synthesizePiper } from "@/lib/tts/piper"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const SAMPLE = "Thanks for calling HelpAProduct. This is the assistant — who am I speaking with?"

// Synthesizes a short sample with the given (possibly unsaved) settings and
// returns it as a WAV at 8 kHz — the exact phone-quality audio a caller hears —
// so the Settings page can preview a voice without placing a call.
export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}))
  const text = String(body.text || SAMPLE).slice(0, 300)
  const provider = String(body.provider || "elevenlabs")

  const override: Partial<AppSettings> = {}
  for (const k of ["elevenLabsVoiceId", "elevenLabsModel", "kokoroVoice"] as const) {
    if (body[k] != null) (override as any)[k] = String(body[k])
  }
  for (const k of ["ttsStability", "ttsSpeed"] as const) {
    if (body[k] != null && Number.isFinite(Number(body[k]))) (override as any)[k] = Number(body[k])
  }

  try {
    let pcm: Int16Array
    switch (provider) {
      case "kokoro":
        pcm = await synthesizeKokoro(text, override)
        break
      case "piper":
        pcm = await synthesizePiper(text)
        break
      case "say":
        pcm = await synthesizeSay(text)
        break
      default:
        pcm = await synthesizeElevenLabs(text, override)
    }
    const wav = encodeWav(pcm, 8000)
    return new NextResponse(new Uint8Array(wav), {
      headers: { "Content-Type": "audio/wav", "Cache-Control": "no-store" },
    })
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}
