"use client"

import { useState } from "react"
import type { BlockedNumber } from "@/lib/db"
import { formatPhone } from "@/lib/format"

export function BlockedManager({ initial }: { initial: BlockedNumber[] }) {
  const [list, setList] = useState(initial)
  const [number, setNumber] = useState("")
  const [reason, setReason] = useState("")
  const [busy, setBusy] = useState(false)

  async function add(e: React.FormEvent) {
    e.preventDefault()
    const n = number.trim()
    if (!n) return
    setBusy(true)
    try {
      await fetch("/api/blocked", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ number: n, reason: reason.trim() || null }),
      })
      const res = await fetch("/api/blocked")
      const data = await res.json()
      setList(data.blocked)
      setNumber("")
      setReason("")
    } finally {
      setBusy(false)
    }
  }

  async function remove(n: string) {
    setBusy(true)
    try {
      await fetch(`/api/blocked?number=${encodeURIComponent(n)}`, { method: "DELETE" })
      setList((l) => l.filter((b) => b.number !== n))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div>
      <form onSubmit={add} className="flex flex-wrap gap-2 mb-5">
        <input
          value={number}
          onChange={(e) => setNumber(e.target.value)}
          placeholder="+14155551212"
          className="bg-neutral-900 border border-neutral-800 rounded-lg px-3 py-1.5 text-sm w-44 focus:outline-none focus:border-neutral-600"
        />
        <input
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Reason (optional)"
          className="bg-neutral-900 border border-neutral-800 rounded-lg px-3 py-1.5 text-sm flex-1 min-w-48 focus:outline-none focus:border-neutral-600"
        />
        <button
          disabled={busy}
          className="rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-1.5 text-sm text-red-300 hover:bg-red-500/20 disabled:opacity-50"
        >
          Block
        </button>
      </form>

      {list.length === 0 ? (
        <div className="rounded-xl border border-dashed border-neutral-800 py-12 text-center text-neutral-500">
          No blocked numbers. Blocked callers are rejected before the AI answers.
        </div>
      ) : (
        <div className="rounded-xl border border-neutral-800 divide-y divide-neutral-800">
          {list.map((b) => (
            <div key={b.id} className="flex items-center justify-between px-4 py-3">
              <div>
                <div className="font-medium text-sm">{formatPhone(b.number)}</div>
                <div className="text-neutral-500 text-xs">{b.reason || "No reason given"}</div>
              </div>
              <button
                onClick={() => remove(b.number)}
                disabled={busy}
                className="text-sm text-neutral-400 hover:text-white disabled:opacity-50"
              >
                Unblock
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
