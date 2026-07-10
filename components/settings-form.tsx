"use client"

import { useEffect, useState } from "react"
import type { AppSettings } from "@/lib/settings"

interface Voice {
  id: string
  name: string
  description: string
}

const inputCls =
  "bg-neutral-900 border border-neutral-800 rounded-lg px-3 py-1.5 text-sm w-full focus:outline-none focus:border-neutral-600"

// Curated natural Kokoro voices (a=American, b=British; f=female, m=male).
const KOKORO_VOICES: { id: string; label: string }[] = [
  { id: "af_bella", label: "Bella — warm female (recommended)" },
  { id: "af_heart", label: "Heart — soft, friendly female" },
  { id: "af_nicole", label: "Nicole — calm female" },
  { id: "af_sarah", label: "Sarah — clear female" },
  { id: "af_sky", label: "Sky — bright female" },
  { id: "af_jessica", label: "Jessica — female" },
  { id: "am_michael", label: "Michael — natural male" },
  { id: "am_adam", label: "Adam — male" },
  { id: "am_echo", label: "Echo — male" },
  { id: "bf_emma", label: "Emma — British female" },
  { id: "bm_george", label: "George — British male" },
]

export function SettingsForm({ initial }: { initial: AppSettings }) {
  const [s, setS] = useState<AppSettings>(initial)
  const [voices, setVoices] = useState<Voice[]>([])
  const [busy, setBusy] = useState(false)
  const [saved, setSaved] = useState<"idle" | "ok" | "err">("idle")

  useEffect(() => {
    fetch("/api/voices")
      .then((r) => r.json())
      .then((d) => setVoices(d.voices ?? []))
      .catch(() => setVoices([]))
  }, [])

  function set<K extends keyof AppSettings>(key: K, value: AppSettings[K]) {
    setS((prev) => ({ ...prev, [key]: value }))
    setSaved("idle")
  }

  async function save() {
    setBusy(true)
    setSaved("idle")
    try {
      const res = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(s),
      })
      if (!res.ok) throw new Error()
      const updated = await res.json()
      setS(updated)
      setSaved("ok")
    } catch {
      setSaved("err")
    } finally {
      setBusy(false)
    }
  }

  const isEleven = s.ttsProvider === "elevenlabs"
  const isKokoro = s.ttsProvider === "kokoro"

  return (
    <div className="space-y-6 max-w-2xl">
      <Section title="Voice">
        <Field label="Provider" hint="Kokoro, Piper & say are free/local; ElevenLabs is premium.">
          <select className={inputCls} value={s.ttsProvider} onChange={(e) => set("ttsProvider", e.target.value)}>
            <option value="elevenlabs">ElevenLabs (premium)</option>
            <option value="kokoro">Kokoro (free, local, natural)</option>
            <option value="piper">Piper (free, local)</option>
            <option value="say">macOS say (free, local)</option>
          </select>
        </Field>

        {isKokoro && (
          <Field label="Kokoro voice" hint="Local neural voices — speed slider applies; stability does not.">
            <select className={inputCls} value={s.kokoroVoice} onChange={(e) => set("kokoroVoice", e.target.value)}>
              {KOKORO_VOICES.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.label}
                </option>
              ))}
            </select>
          </Field>
        )}

        <Field label="ElevenLabs voice" hint={isEleven ? undefined : "Only used when provider is ElevenLabs."}>
          <select
            className={inputCls}
            value={s.elevenLabsVoiceId}
            disabled={!isEleven}
            onChange={(e) => set("elevenLabsVoiceId", e.target.value)}
          >
            {voices.length === 0 && <option value={s.elevenLabsVoiceId}>{s.elevenLabsVoiceId}</option>}
            {voices.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name}
                {v.description ? ` — ${v.description}` : ""}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Model">
          <select
            className={inputCls}
            value={s.elevenLabsModel}
            disabled={!isEleven}
            onChange={(e) => set("elevenLabsModel", e.target.value)}
          >
            <option value="eleven_flash_v2_5">eleven_flash_v2_5 (fastest)</option>
            <option value="eleven_turbo_v2_5">eleven_turbo_v2_5 (richer)</option>
          </select>
        </Field>

        <Slider label="Stability" hint="Higher = calmer/steadier, lower = more expressive."
          min={0} max={1} step={0.05} value={s.ttsStability} onChange={(v) => set("ttsStability", v)} />
        <Slider label="Speed" hint="1.0 = natural; below = slower/calmer."
          min={0.7} max={1.2} step={0.05} value={s.ttsSpeed} onChange={(v) => set("ttsSpeed", v)} />
      </Section>

      <Section title="Assistant">
        <Field label="Business name">
          <input className={inputCls} value={s.businessName} onChange={(e) => set("businessName", e.target.value)} />
        </Field>
        <Field label="Greeting" hint="The first thing the assistant says when it picks up.">
          <textarea
            className={inputCls + " min-h-[70px] resize-y"}
            value={s.greeting}
            onChange={(e) => set("greeting", e.target.value)}
          />
        </Field>
      </Section>

      <Section title="Brain & filtering">
        <Field label="LLM model" hint="OpenRouter model id, e.g. openai/gpt-4o-mini.">
          <input className={inputCls} value={s.llmModel} onChange={(e) => set("llmModel", e.target.value)} />
        </Field>
        <Slider label={`Spam threshold (${s.spamThreshold.toFixed(2)})`}
          hint="Calls scored at or above this are flagged as spam. Higher = fewer flags."
          min={0} max={1} step={0.05} value={s.spamThreshold} onChange={(v) => set("spamThreshold", v)} />
      </Section>

      <div className="flex items-center gap-3">
        <button
          onClick={save}
          disabled={busy}
          className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-4 py-1.5 text-sm text-emerald-300 hover:bg-emerald-500/20 disabled:opacity-50"
        >
          {busy ? "Saving…" : "Save settings"}
        </button>
        {saved === "ok" && <span className="text-emerald-400 text-sm">Saved — live on next call.</span>}
        {saved === "err" && <span className="text-red-400 text-sm">Save failed.</span>}
      </div>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-neutral-800 p-4">
      <h2 className="text-sm font-semibold text-neutral-300 mb-3">{title}</h2>
      <div className="space-y-4">{children}</div>
    </div>
  )
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <div className="text-sm text-neutral-300 mb-1">{label}</div>
      {children}
      {hint && <div className="text-neutral-600 text-xs mt-1">{hint}</div>}
    </label>
  )
}

function Slider({
  label, hint, min, max, step, value, onChange,
}: {
  label: string; hint?: string; min: number; max: number; step: number
  value: number; onChange: (v: number) => void
}) {
  return (
    <label className="block">
      <div className="flex justify-between text-sm text-neutral-300 mb-1">
        <span>{label}</span>
        <span className="tabular-nums text-neutral-500">{value.toFixed(2)}</span>
      </div>
      <input
        type="range" min={min} max={max} step={step} value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-emerald-500"
      />
      {hint && <div className="text-neutral-600 text-xs mt-1">{hint}</div>}
    </label>
  )
}
