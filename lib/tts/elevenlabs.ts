import { config } from "../config"
import { getSettings, type AppSettings } from "../settings"
import { resamplePcm16 } from "../audio/mulaw"

// ElevenLabs — premium, paid. Wired up as an optional upgrade. Requests raw
// PCM at 16 kHz and resamples to 8 kHz to match the rest of the pipeline. Voice,
// model, and delivery come from live settings; the API key stays in .env.
// `override` lets the preview endpoint synthesize unsaved settings.
export async function synthesizeElevenLabs(
  text: string,
  override: Partial<AppSettings> = {},
): Promise<Int16Array> {
  if (!config.tts.elevenLabsKey) throw new Error("ELEVENLABS_API_KEY not set")

  const s = { ...(await getSettings()), ...override }
  const url = `https://api.elevenlabs.io/v1/text-to-speech/${s.elevenLabsVoiceId}?output_format=pcm_16000`
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "xi-api-key": config.tts.elevenLabsKey,
      "Content-Type": "application/json",
      Accept: "audio/pcm",
    },
    body: JSON.stringify({
      text,
      // flash_v2_5 = lowest latency (~75ms) and still natural; turbo_v2_5 = a bit
      // richer but slower. Higher stability = calmer/steadier; speed < 1 = slower.
      model_id: s.elevenLabsModel,
      voice_settings: { stability: s.ttsStability, similarity_boost: 0.75, speed: s.ttsSpeed },
    }),
  })

  if (!res.ok) {
    throw new Error(`ElevenLabs ${res.status}: ${(await res.text()).slice(0, 200)}`)
  }

  const buf = Buffer.from(await res.arrayBuffer())
  const pcm16k = new Int16Array(buf.length / 2)
  for (let i = 0; i < pcm16k.length; i++) pcm16k[i] = buf.readInt16LE(i * 2)
  return resamplePcm16(pcm16k, 16000, 8000)
}
