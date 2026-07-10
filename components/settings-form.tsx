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

// Preset OpenRouter models. Any model id works (pick "Custom…" to type one).
const LLM_MODELS: { id: string; label: string }[] = [
  { id: "google/gemini-2.5-flash-lite", label: "Gemini 2.5 Flash Lite — recommended for voice · faster & cheaper than 4o-mini ($0.10/$0.40)" },
  { id: "openai/gpt-4o-mini", label: "GPT-4o-mini — balanced ($0.15/$0.60)" },
  { id: "x-ai/grok-4.1-fast", label: "Grok 4.1 Fast — best tool-calling, cache-friendly ($0.20/$0.50)" },
  { id: "google/gemini-3.1-flash-lite-preview", label: "Gemini 3.1 Flash Lite — newest, smarter · preview ($0.25/$1.50)" },
  { id: "deepseek/deepseek-v4-flash:nitro", label: "DeepSeek V4 Flash — cheapest · :nitro = fastest provider ($0.084/$0.168)" },
]

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
  const [previewing, setPreviewing] = useState(false)
  const [previewErr, setPreviewErr] = useState<string | null>(null)
  const [testMsg, setTestMsg] = useState("Hi, do you build iOS apps?")
  const [testing, setTesting] = useState(false)
  const [testReply, setTestReply] = useState<{ reply: string; ms: number } | null>(null)
  const [testErr, setTestErr] = useState<string | null>(null)

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

  async function preview() {
    setPreviewing(true)
    setPreviewErr(null)
    try {
      const res = await fetch("/api/tts-preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider: s.ttsProvider,
          elevenLabsVoiceId: s.elevenLabsVoiceId,
          elevenLabsModel: s.elevenLabsModel,
          kokoroVoice: s.kokoroVoice,
          ttsStability: s.ttsStability,
          ttsSpeed: s.ttsSpeed,
        }),
      })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        throw new Error(j.error || `Preview failed (${res.status})`)
      }
      const url = URL.createObjectURL(await res.blob())
      const audio = new Audio(url)
      audio.onended = () => URL.revokeObjectURL(url)
      await audio.play()
    } catch (e) {
      setPreviewErr((e as Error).message)
    } finally {
      setPreviewing(false)
    }
  }

  async function runModelTest() {
    if (!testMsg.trim()) return
    setTesting(true)
    setTestErr(null)
    setTestReply(null)
    try {
      const res = await fetch("/api/model-test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: testMsg, llmModel: s.llmModel, businessName: s.businessName }),
      })
      const j = await res.json()
      if (!res.ok) throw new Error(j.error || `Test failed (${res.status})`)
      setTestReply({ reply: j.reply, ms: j.ms })
    } catch (e) {
      setTestErr((e as Error).message)
    } finally {
      setTesting(false)
    }
  }

  const isEleven = s.ttsProvider === "elevenlabs"
  const isKokoro = s.ttsProvider === "kokoro"
  const isCustomModel = !LLM_MODELS.some((m) => m.id === s.llmModel)

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

        <div className="flex items-center gap-3 pt-1">
          <button
            type="button"
            onClick={preview}
            disabled={previewing}
            className="rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-1.5 text-sm text-neutral-200 hover:bg-neutral-700 disabled:opacity-50"
          >
            {previewing ? "Synthesizing…" : "▶ Preview voice"}
          </button>
          <span className="text-neutral-600 text-xs">
            Plays the current (unsaved) voice at phone quality — 8 kHz, like a real call.
          </span>
        </div>
        {previewErr && <div className="text-red-400 text-xs">{previewErr}</div>}
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
        <Field label="LLM model" hint="The model that writes replies. Any OpenRouter model id works — append :nitro to route to the fastest provider. Reasoning is kept off for low phone latency.">
          <select
            className={inputCls}
            value={isCustomModel ? "__custom__" : s.llmModel}
            onChange={(e) => {
              const v = e.target.value
              if (v === "__custom__") {
                if (!isCustomModel) set("llmModel", "")
              } else {
                set("llmModel", v)
              }
            }}
          >
            {LLM_MODELS.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label}
              </option>
            ))}
            <option value="__custom__">Custom…</option>
          </select>
        </Field>
        {isCustomModel && (
          <Field label="Custom model id">
            <input
              className={inputCls}
              placeholder="e.g. anthropic/claude-haiku-4-5"
              value={s.llmModel}
              onChange={(e) => set("llmModel", e.target.value)}
            />
          </Field>
        )}

        {/* Live model tester — uses the selected (unsaved) model + your persona + knowledge. */}
        <div className="rounded-lg border border-neutral-800 bg-neutral-900/60 p-3 space-y-2">
          <div className="text-sm text-neutral-300">Test the model</div>
          <div className="text-neutral-600 text-xs">
            Send a caller message and see how the <strong>selected</strong> model replies (with your
            persona + knowledge base). Doesn't save — change the model above and re-run to compare.
          </div>
          <textarea
            className={inputCls + " min-h-[52px] resize-y"}
            value={testMsg}
            onChange={(e) => setTestMsg(e.target.value)}
            placeholder="Type a caller message…"
          />
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={runModelTest}
              disabled={testing || !testMsg.trim()}
              className="rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-1.5 text-sm text-neutral-200 hover:bg-neutral-700 disabled:opacity-50"
            >
              {testing ? "Asking…" : "Ask"}
            </button>
            <span className="text-neutral-600 text-xs truncate">
              {isCustomModel ? s.llmModel || "(no model)" : s.llmModel}
            </span>
          </div>
          {testErr && <div className="text-red-400 text-xs">{testErr}</div>}
          {testReply && (
            <div className="rounded-lg bg-neutral-900 border border-neutral-800 p-3">
              <div className="text-[10px] uppercase tracking-wide text-neutral-500 mb-1">
                Assistant · {(testReply.ms / 1000).toFixed(1)}s
              </div>
              <div className="text-sm text-neutral-200 whitespace-pre-wrap">{testReply.reply}</div>
            </div>
          )}
        </div>

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
