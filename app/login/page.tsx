"use client"

import { useState } from "react"

export default function LoginPage() {
  const [password, setPassword] = useState("")
  const [error, setError] = useState("")
  const [busy, setBusy] = useState(false)

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError("")
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ password }),
      })
      if (res.ok) {
        const params = new URLSearchParams(window.location.search)
        const next = params.get("next")
        // Only allow same-origin relative redirects.
        window.location.href = next && next.startsWith("/") && !next.startsWith("//") ? next : "/"
        return
      }
      const data = await res.json().catch(() => ({}))
      setError(data.error || "Login failed.")
    } catch {
      setError("Network error. Try again.")
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="min-h-[60vh] flex items-center justify-center">
      <form
        onSubmit={onSubmit}
        className="w-full max-w-sm rounded-2xl border border-neutral-800 bg-neutral-900/60 p-6 shadow-xl"
      >
        <div className="flex items-center gap-2 font-semibold tracking-tight mb-1">
          <span className="text-emerald-400">●</span> hap-voice
        </div>
        <h1 className="text-lg font-semibold mb-4">Sign in</h1>

        <label htmlFor="password" className="block text-sm text-neutral-400 mb-1">
          Dashboard password
        </label>
        <input
          id="password"
          type="password"
          autoFocus
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm outline-none focus:border-emerald-500"
        />

        {error && <p className="mt-3 text-sm text-red-400">{error}</p>}

        <button
          type="submit"
          disabled={busy || !password}
          className="mt-4 w-full rounded-lg bg-emerald-500 px-3 py-2 text-sm font-semibold text-neutral-950 hover:bg-emerald-400 disabled:opacity-50 transition-colors"
        >
          {busy ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </div>
  )
}
