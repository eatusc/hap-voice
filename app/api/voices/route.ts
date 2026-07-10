import { NextResponse } from "next/server"
import { config } from "@/lib/config"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

// Lists the ElevenLabs voices available in the account, for the Settings voice
// picker. Uses the server-side key so it never reaches the browser.
export async function GET() {
  const key = config.tts.elevenLabsKey
  if (!key) return NextResponse.json({ voices: [] })

  try {
    const res = await fetch("https://api.elevenlabs.io/v1/voices", {
      headers: { "xi-api-key": key },
    })
    if (!res.ok) return NextResponse.json({ voices: [], error: `ElevenLabs ${res.status}` })
    const data = await res.json()
    const voices = (data.voices ?? []).map((v: any) => {
      const l = v.labels ?? {}
      const desc = [l.gender, l.age, l.accent, l.descriptive || l.description, l.use_case]
        .filter(Boolean)
        .join(" · ")
      return { id: v.voice_id, name: v.name, description: desc }
    })
    return NextResponse.json({ voices })
  } catch (err) {
    return NextResponse.json({ voices: [], error: (err as Error).message })
  }
}
