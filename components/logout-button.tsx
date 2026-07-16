"use client"

import { usePathname } from "next/navigation"

export function LogoutButton() {
  const pathname = usePathname()
  // No logout control on the login screen itself.
  if (pathname === "/login") return null

  async function onClick() {
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => {})
    window.location.href = "/login"
  }

  return (
    <button
      onClick={onClick}
      className="ml-1 px-3 py-1.5 rounded-lg text-neutral-400 hover:text-white hover:bg-neutral-800 transition-colors"
      title="Log out"
    >
      Log out
    </button>
  )
}
