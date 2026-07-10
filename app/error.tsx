"use client"

import { useEffect } from "react"
import { isChunkError } from "@/components/chunk-error-reloader"

// Route-level error boundary. Catches any client render error and shows a clean
// recovery UI instead of the bare "Application error" screen. Stale-chunk errors
// auto-reload; everything else offers Try again / Reload.
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    if (isChunkError(error)) {
      const KEY = "hapv-chunk-reload-at"
      const last = Number(sessionStorage.getItem(KEY) || "0")
      if (Date.now() - last > 10000) {
        sessionStorage.setItem(KEY, String(Date.now()))
        window.location.reload()
      }
    }
  }, [error])

  const stale = isChunkError(error)

  return (
    <div className="min-h-[60vh] flex items-center justify-center px-5">
      <div className="max-w-md text-center">
        <div className="text-3xl mb-3">{stale ? "🔄" : "⚠️"}</div>
        <h1 className="text-lg font-semibold mb-1">
          {stale ? "Refreshing…" : "Something went wrong"}
        </h1>
        <p className="text-sm text-neutral-400 mb-5">
          {stale
            ? "The app updated in the background. Reloading to catch up."
            : "This page hit an error. You can retry, or reload."}
        </p>
        <div className="flex items-center justify-center gap-2">
          <button
            onClick={() => reset()}
            className="rounded-lg border border-neutral-700 bg-neutral-800 px-4 py-2 text-sm hover:bg-neutral-700"
          >
            Try again
          </button>
          <button
            onClick={() => window.location.reload()}
            className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-4 py-2 text-sm text-emerald-300 hover:bg-emerald-500/20"
          >
            Reload
          </button>
        </div>
      </div>
    </div>
  )
}
