"use client"

import { useEffect, useState } from "react"
import type { Message } from "@/lib/db"
import { formatPhone, relativeTime } from "@/lib/format"

export function MessageFeed({ initial }: { initial: Message[] }) {
  const [messages, setMessages] = useState(initial)

  // Mark inbound texts as read once viewed, and poll for new ones.
  useEffect(() => {
    fetch("/api/messages/read", { method: "POST" }).catch(() => {})
    const t = setInterval(async () => {
      try {
        const res = await fetch("/api/messages")
        const data = await res.json()
        setMessages(data.messages)
      } catch {
        /* ignore */
      }
    }, 10000)
    return () => clearInterval(t)
  }, [])

  if (messages.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-neutral-800 py-16 text-center text-neutral-500">
        <p className="mb-1">No texts yet.</p>
        <p className="text-sm">
          Point Twilio&apos;s Messaging webhook at{" "}
          <code className="text-neutral-300">/api/sms/incoming</code>. Verification codes will
          appear here.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {messages.map((m) => (
        <MessageCard key={m.id} m={m} />
      ))}
    </div>
  )
}

function MessageCard({ m }: { m: Message }) {
  return (
    <div className="rounded-xl border border-neutral-800 bg-neutral-900/40 p-4">
      <div className="flex items-center justify-between mb-1.5">
        <div className="font-medium text-sm">{formatPhone(m.from_number)}</div>
        <div className="text-xs text-neutral-500">{relativeTime(m.received_at)}</div>
      </div>
      <p className="text-sm text-neutral-200 whitespace-pre-wrap break-words">{m.body}</p>
      {m.detected_code && <CodeChip code={m.detected_code} />}
      {m.num_media > 0 && (
        <div className="mt-2 text-xs text-neutral-500">📎 {m.num_media} attachment(s)</div>
      )}
    </div>
  )
}

function CodeChip({ code }: { code: string }) {
  const [copied, setCopied] = useState(false)
  async function copy() {
    try {
      await navigator.clipboard.writeText(code)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      /* clipboard blocked */
    }
  }
  return (
    <button
      onClick={copy}
      className="mt-2.5 inline-flex items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-1.5 text-sm text-emerald-300 hover:bg-emerald-500/20"
      title="Copy code"
    >
      <span className="text-[10px] uppercase tracking-wide text-emerald-500/70">Code</span>
      <span className="font-mono font-semibold tracking-widest">{code}</span>
      <span className="text-xs text-emerald-400">{copied ? "copied ✓" : "copy"}</span>
    </button>
  )
}
