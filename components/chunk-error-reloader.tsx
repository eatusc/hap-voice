"use client"

import { useEffect } from "react"

// Self-heals the #1 dev annoyance: after the server restarts, an open tab holds
// stale code chunks and the next navigation/poll throws a ChunkLoadError. We
// detect that specific error and reload once (guarded against loops). Any other
// error is left for the error boundaries to handle.
function isChunkError(v: unknown): boolean {
  const s =
    typeof v === "string"
      ? v
      : v && typeof v === "object"
        ? `${(v as any).name ?? ""} ${(v as any).message ?? ""}`
        : ""
  return (
    /ChunkLoadError/i.test(s) ||
    /Loading chunk [\w-]+ failed/i.test(s) ||
    /Loading CSS chunk/i.test(s) ||
    /error loading dynamically imported module/i.test(s) ||
    /Failed to fetch dynamically imported module/i.test(s)
  )
}

function reloadOnce() {
  const KEY = "hapv-chunk-reload-at"
  const last = Number(sessionStorage.getItem(KEY) || "0")
  // If we already reloaded within 10s, stop — avoids an infinite reload loop.
  if (Date.now() - last < 10000) return
  sessionStorage.setItem(KEY, String(Date.now()))
  window.location.reload()
}

export function ChunkErrorReloader() {
  useEffect(() => {
    const onError = (e: ErrorEvent) => {
      if (isChunkError(e.message) || isChunkError(e.error)) reloadOnce()
    }
    const onRejection = (e: PromiseRejectionEvent) => {
      if (isChunkError(e.reason)) reloadOnce()
    }
    window.addEventListener("error", onError)
    window.addEventListener("unhandledrejection", onRejection)
    return () => {
      window.removeEventListener("error", onError)
      window.removeEventListener("unhandledrejection", onRejection)
    }
  }, [])
  return null
}

export { isChunkError }
