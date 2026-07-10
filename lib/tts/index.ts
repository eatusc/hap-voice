import { config } from "../config"
import { synthesizeSay } from "./say"
import { synthesizePiper } from "./piper"
import { synthesizeElevenLabs } from "./elevenlabs"

// All providers return PCM16 mono at 8 kHz — the rate Twilio Media Streams use.
export const TTS_RATE = 8000

export interface TtsProvider {
  synthesize(text: string): Promise<Int16Array>
}

export function getTts(): TtsProvider {
  switch (config.tts.provider) {
    case "piper":
      return { synthesize: synthesizePiper }
    case "elevenlabs":
      return { synthesize: synthesizeElevenLabs }
    case "say":
    default:
      return { synthesize: synthesizeSay }
  }
}
