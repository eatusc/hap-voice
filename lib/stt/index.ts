import { config } from "../config"
import { transcribeWhisper } from "./whisper"

export interface SttProvider {
  /** Transcribe an utterance of PCM16 mono audio at the given sample rate. */
  transcribe(pcm: Int16Array, sampleRate: number): Promise<string>
}

export function getStt(): SttProvider {
  switch (config.stt.provider) {
    case "whisper":
    default:
      return { transcribe: transcribeWhisper }
  }
}
