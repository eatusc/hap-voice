import { config } from "../config"
import { resamplePcm16 } from "../audio/mulaw"

// ElevenLabs — premium, paid. Wired up as an optional upgrade. Requests raw
// PCM at 16 kHz and resamples to 8 kHz to match the rest of the pipeline.
export async function synthesizeElevenLabs(text: string): Promise<Int16Array> {
  if (!config.tts.elevenLabsKey) throw new Error("ELEVENLABS_API_KEY not set")

  const url = `https://api.elevenlabs.io/v1/text-to-speech/${config.tts.elevenLabsVoiceId}?output_format=pcm_16000`
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
      // richer but slower. Configurable via ELEVENLABS_MODEL.
      model_id: config.tts.elevenLabsModel,
      voice_settings: { stability: 0.4, similarity_boost: 0.75, speed: 1.05 },
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
