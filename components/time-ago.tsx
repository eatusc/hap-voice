"use client"

import { useEffect, useState } from "react"
import { relativeTime } from "@/lib/format"

// Renders a relative timestamp on the CLIENT only. Server render (and the first
// client render) emit an empty span, so there's never a hydration mismatch —
// the value fills in after mount and refreshes every 30s.
export function TimeAgo({ iso }: { iso: string }) {
  const [text, setText] = useState("")
  useEffect(() => {
    const update = () => setText(relativeTime(iso))
    update()
    const t = setInterval(update, 30000)
    return () => clearInterval(t)
  }, [iso])
  return (
    <span suppressHydrationWarning>{text}</span>
  )
}
