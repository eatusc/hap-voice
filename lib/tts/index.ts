import { getSettings } from "../settings"
import { synthesizeSay } from "./say"
import { synthesizePiper } from "./piper"
import { synthesizeElevenLabs } from "./elevenlabs"
import { synthesizeKokoro } from "./kokoro"

// All providers return PCM16 mono at 8 kHz — the rate Twilio Media Streams use.
export const TTS_RATE = 8000

export interface TtsProvider {
  synthesize(text: string, signal?: AbortSignal): Promise<Int16Array>
}

// Provider is resolved per utterance from live settings, so changing the voice in
// the dashboard takes effect on the next thing the assistant says — no restart.
// The signal is aborted on barge-in; network providers pass it to fetch so an
// interrupted reply stops synthesizing instead of finishing in the background.
async function synthesize(text: string, signal?: AbortSignal): Promise<Int16Array> {
  const { ttsProvider } = await getSettings()
  switch (ttsProvider) {
    case "piper":
      return synthesizePiper(text)
    case "elevenlabs":
      return synthesizeElevenLabs(text, {}, signal)
    case "kokoro":
      return synthesizeKokoro(text, {}, signal)
    case "say":
    default:
      return synthesizeSay(text)
  }
}

export function getTts(): TtsProvider {
  return { synthesize }
}
