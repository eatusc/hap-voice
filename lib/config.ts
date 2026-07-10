// Central config, read once from the environment.

function env(key: string, fallback = ""): string {
  return process.env[key] ?? fallback
}

export const config = {
  port: parseInt(env("PORT", "3010"), 10),
  publicHost: env("PUBLIC_HOST"),
  databaseUrl: env("DATABASE_URL", "postgres://localhost:5432/hap_voice"),

  twilio: {
    authToken: env("TWILIO_AUTH_TOKEN"),
    skipValidation: env("TWILIO_SKIP_VALIDATION", "true") === "true",
  },

  llm: {
    apiKey: env("OPENROUTER_API_KEY"),
    model: env("OPENROUTER_MODEL", "openai/gpt-4o-mini"),
    baseUrl: "https://openrouter.ai/api/v1",
  },

  stt: {
    provider: env("STT_PROVIDER", "whisper"),
    whisperCli: env("WHISPER_CLI", "/opt/homebrew/bin/whisper-cli"),
    whisperModel: env("WHISPER_MODEL", "./models/ggml-base.en.bin"),
  },

  tts: {
    provider: env("TTS_PROVIDER", "say"),
    sayVoice: env("SAY_VOICE", "Samantha"),
    piperBin: env("PIPER_BIN", "/opt/homebrew/bin/piper"),
    piperVoice: env("PIPER_VOICE", "./models/en_US-lessac-medium.onnx"),
    elevenLabsKey: env("ELEVENLABS_API_KEY"),
    elevenLabsVoiceId: env("ELEVENLABS_VOICE_ID", "21m00Tcm4TlvDq8ikWAM"),
  },

  persona: {
    businessName: env("BUSINESS_NAME", "HelpAProduct"),
    greeting: env(
      "ASSISTANT_GREETING",
      "Thanks for calling HelpAProduct. This is the assistant — who am I speaking with?",
    ),
  },
}

export type Config = typeof config
