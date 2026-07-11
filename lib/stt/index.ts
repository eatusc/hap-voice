import { config } from "../config"
import { prepareWhisper, transcribeWhisper } from "./whisper"

export interface SttProvider {
  /** Load any expensive local resources before the first live utterance. */
  prepare?(): Promise<void>
  /** Transcribe an utterance of PCM16 mono audio at the given sample rate. */
  transcribe(pcm: Int16Array, sampleRate: number): Promise<string>
}

export function getStt(): SttProvider {
  switch (config.stt.provider) {
    case "whisper":
    default:
      return { prepare: prepareWhisper, transcribe: transcribeWhisper }
  }
}
