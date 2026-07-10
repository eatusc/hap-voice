"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"

export function BlockButton({
  number,
  reason,
  blocked,
}: {
  number: string
  reason?: string | null
  blocked: boolean
}) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [isBlocked, setIsBlocked] = useState(blocked)

  async function toggle() {
    setBusy(true)
    try {
      if (isBlocked) {
        await fetch(`/api/blocked?number=${encodeURIComponent(number)}`, { method: "DELETE" })
        setIsBlocked(false)
      } else {
        await fetch("/api/blocked", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ number, reason: reason ?? "Blocked from call log" }),
        })
        setIsBlocked(true)
      }
      router.refresh()
    } finally {
      setBusy(false)
    }
  }

  if (number === "unknown") return null

  return (
    <button
      onClick={toggle}
      disabled={busy}
      className={
        isBlocked
          ? "rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-1.5 text-sm text-neutral-300 hover:bg-neutral-700 disabled:opacity-50"
          : "rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-1.5 text-sm text-red-300 hover:bg-red-500/20 disabled:opacity-50"
      }
    >
      {busy ? "…" : isBlocked ? "Unblock number" : "Block number"}
    </button>
  )
}
