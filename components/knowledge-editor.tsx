"use client"

import { useState } from "react"

export function KnowledgeEditor({ initial }: { initial: string }) {
  const [content, setContent] = useState(initial)
  const [busy, setBusy] = useState(false)
  const [saved, setSaved] = useState<"idle" | "ok" | "err">("idle")
  const dirty = content !== initial

  async function save() {
    setBusy(true)
    setSaved("idle")
    try {
      const res = await fetch("/api/knowledge", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
      })
      if (!res.ok) throw new Error()
      setSaved("ok")
    } catch {
      setSaved("err")
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-3">
      <textarea
        value={content}
        onChange={(e) => {
          setContent(e.target.value)
          setSaved("idle")
        }}
        spellCheck={false}
        className="w-full min-h-[60vh] font-mono text-sm bg-neutral-900 border border-neutral-800 rounded-xl px-4 py-3 focus:outline-none focus:border-neutral-600 resize-y"
      />
      <div className="flex items-center gap-3">
        <button
          onClick={save}
          disabled={busy || !dirty}
          className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-4 py-1.5 text-sm text-emerald-300 hover:bg-emerald-500/20 disabled:opacity-50"
        >
          {busy ? "Saving…" : "Save knowledge"}
        </button>
        {dirty && saved === "idle" && <span className="text-neutral-500 text-sm">Unsaved changes</span>}
        {saved === "ok" && <span className="text-emerald-400 text-sm">Saved — live on next call.</span>}
        {saved === "err" && <span className="text-red-400 text-sm">Save failed.</span>}
      </div>
    </div>
  )
}
