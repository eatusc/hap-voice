// Central config, read once from the environment.

function env(key: string, fallback = ""): string {
  return process.env[key] ?? fallback
}

// Webhook signature validation may only be skipped OUTSIDE production, and even
// then only when the flag is explicitly set. In production the flag is ignored
// entirely — a live deployment always validates, no matter what the env says —
// so a stray SKIP_VALIDATION=true can never silently open a real phone line.
const isProduction = process.env.NODE_ENV === "production"
function skipValidation(key: string): boolean {
  return !isProduction && env(key) === "true"
}

export const config = {
  port: parseInt(env("PORT", "3010"), 10),
  publicHost: env("PUBLIC_HOST"),
  databaseUrl: env("DATABASE_URL", "postgres://localhost:5432/hap_voice"),

  // Which pipeline answers the phone: "local" (Twilio Media Streams → VAD →
  // whisper → OpenRouter → TTS) or "retell" (Retell AI agent → webhooks).
  // Overridable live from the Settings page; see RETELL.md.
  voiceProvider: env("VOICE_PROVIDER", "local"),

  twilio: {
    authToken: env("TWILIO_AUTH_TOKEN"),
    skipValidation: skipValidation("TWILIO_SKIP_VALIDATION"),
  },

  retell: {
    apiKey: env("RETELL_API_KEY"),
    agentId: env("RETELL_AGENT_ID"),
    skipValidation: skipValidation("RETELL_SKIP_VALIDATION"),
    apiBase: env("RETELL_API_BASE", "https://api.retellai.com"),
    sipDomain: env("RETELL_SIP_DOMAIN", "sip.retellai.com"),
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
    elevenLabsModel: env("ELEVENLABS_MODEL", "eleven_flash_v2_5"),
    kokoroUrl: env("KOKORO_URL", "http://127.0.0.1:5111"),
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
