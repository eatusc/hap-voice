import { config } from "./config"
import { query } from "./db"

// Behavioral settings that can be changed live from the dashboard. Their defaults
// come from .env (via config); the app_settings table overrides them at runtime.
// Secrets (API keys) and infra (port, hosts, DB URL) are NOT here — they stay in .env.
export interface AppSettings {
  ttsProvider: string // "say" | "piper" | "elevenlabs" | "kokoro"
  elevenLabsVoiceId: string
  elevenLabsModel: string
  kokoroVoice: string
  ttsStability: number
  ttsSpeed: number
  llmModel: string
  businessName: string
  greeting: string
  spamThreshold: number
}

function defaults(): AppSettings {
  return {
    ttsProvider: config.tts.provider,
    elevenLabsVoiceId: config.tts.elevenLabsVoiceId,
    elevenLabsModel: config.tts.elevenLabsModel,
    kokoroVoice: "af_bella",
    ttsStability: 0.55,
    ttsSpeed: 1.0,
    llmModel: config.llm.model,
    businessName: config.persona.businessName,
    greeting: config.persona.greeting,
    spamThreshold: 0.6,
  }
}

const NUMERIC = new Set<keyof AppSettings>(["ttsStability", "ttsSpeed", "spamThreshold"])

// Short in-memory cache so the call hot-path doesn't hit the DB every utterance,
// while edits still take effect within a few seconds (and immediately after a save,
// which clears the cache).
let cache: { at: number; data: AppSettings } | null = null
const TTL_MS = 3000

export async function getSettings(): Promise<AppSettings> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.data
  const merged = defaults()
  try {
    const rows = await query<{ key: string; value: string }>(
      `SELECT key, value FROM app_settings`,
    )
    for (const { key, value } of rows) {
      if (!(key in merged)) continue
      const k = key as keyof AppSettings
      ;(merged as any)[k] = NUMERIC.has(k) ? Number(value) : value
    }
  } catch {
    // Table may not exist yet (pre-migration) — fall back to .env defaults.
  }
  cache = { at: Date.now(), data: merged }
  return merged
}

// Persist a partial update. Only known keys are written; numbers are clamped to
// sensible ranges so a bad value can't wedge the pipeline.
export async function updateSettings(patch: Partial<AppSettings>): Promise<AppSettings> {
  const allowed = defaults()
  for (const [key, raw] of Object.entries(patch)) {
    if (!(key in allowed)) continue
    const k = key as keyof AppSettings
    let value = raw as unknown
    if (NUMERIC.has(k)) {
      let n = Number(value)
      if (!Number.isFinite(n)) continue
      if (k === "ttsSpeed") n = Math.min(1.2, Math.max(0.7, n))
      else n = Math.min(1, Math.max(0, n)) // stability, spamThreshold
      value = n
    }
    await query(
      `INSERT INTO app_settings (key, value, updated_at) VALUES ($1, $2, now())
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
      [k, String(value)],
    )
  }
  cache = null // apply immediately
  return getSettings()
}
