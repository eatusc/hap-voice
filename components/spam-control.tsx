"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"

export function SpamControl({ callId, isSpam }: { callId: number; isSpam: boolean }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [spam, setSpam] = useState(isSpam)

  async function set(next: boolean) {
    setBusy(true)
    try {
      await fetch(`/api/calls/${callId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_spam: next }),
      })
      setSpam(next)
      router.refresh()
    } finally {
      setBusy(false)
    }
  }

  return (
    <button
      onClick={() => set(!spam)}
      disabled={busy}
      className={
        spam
          ? "rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-1.5 text-sm text-neutral-300 hover:bg-neutral-700 disabled:opacity-50"
          : "rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-1.5 text-sm text-amber-300 hover:bg-amber-500/20 disabled:opacity-50"
      }
      title={spam ? "Currently flagged as spam" : "Flag this call as spam"}
    >
      {busy ? "…" : spam ? "Not spam" : "Mark spam"}
    </button>
  )
}
