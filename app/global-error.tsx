"use client"

import { useEffect } from "react"

// Last-resort boundary — catches errors thrown in the root layout itself.
// Must render its own <html>/<body>. Auto-reloads stale-chunk errors.
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    const s = `${error?.name ?? ""} ${error?.message ?? ""}`
    if (/ChunkLoadError|Loading chunk|dynamically imported module/i.test(s)) {
      const KEY = "hapv-chunk-reload-at"
      const last = Number(sessionStorage.getItem(KEY) || "0")
      if (Date.now() - last > 10000) {
        sessionStorage.setItem(KEY, String(Date.now()))
        window.location.reload()
      }
    }
  }, [error])

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#0a0a0a",
          color: "#e5e5e5",
          fontFamily: "system-ui, -apple-system, sans-serif",
        }}
      >
        <div style={{ textAlign: "center", maxWidth: 400, padding: 20 }}>
          <div style={{ fontSize: 28, marginBottom: 12 }}>⚠️</div>
          <h1 style={{ fontSize: 18, margin: "0 0 6px" }}>Something went wrong</h1>
          <p style={{ fontSize: 14, color: "#a3a3a3", margin: "0 0 20px" }}>
            The console has details. Reloading usually fixes it.
          </p>
          <div style={{ display: "flex", gap: 8, justifyContent: "center" }}>
            <button
              onClick={() => reset()}
              style={{
                borderRadius: 8,
                border: "1px solid #404040",
                background: "#262626",
                color: "#e5e5e5",
                padding: "8px 16px",
                fontSize: 14,
                cursor: "pointer",
              }}
            >
              Try again
            </button>
            <button
              onClick={() => window.location.reload()}
              style={{
                borderRadius: 8,
                border: "1px solid rgba(16,185,129,.4)",
                background: "rgba(16,185,129,.1)",
                color: "#6ee7b7",
                padding: "8px 16px",
                fontSize: 14,
                cursor: "pointer",
              }}
            >
              Reload
            </button>
          </div>
        </div>
      </body>
    </html>
  )
}
