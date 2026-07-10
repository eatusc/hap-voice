import type { Metadata } from "next"
import Link from "next/link"
import { countUnreadMessages } from "@/lib/db"
import { ChunkErrorReloader } from "@/components/chunk-error-reloader"
import "./globals.css"

export const metadata: Metadata = {
  title: "hap-voice — call console",
  description: "AI voice receptionist call log",
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  let unread = 0
  try {
    unread = await countUnreadMessages()
  } catch {
    /* DB may not be set up yet */
  }

  return (
    <html lang="en">
      <body>
        <ChunkErrorReloader />
        <div className="min-h-screen">
          <header className="border-b border-neutral-800 bg-neutral-900/60 backdrop-blur sticky top-0 z-10">
            <div className="mx-auto max-w-5xl px-5 h-14 flex items-center justify-between">
              <Link href="/" className="font-semibold tracking-tight flex items-center gap-2">
                <span className="text-emerald-400">●</span> hap-voice
              </Link>
              <nav className="flex items-center gap-1 text-sm">
                <NavLink href="/">Calls</NavLink>
                <NavLink href="/messages">
                  Texts
                  {unread > 0 && (
                    <span className="ml-1.5 inline-flex items-center justify-center rounded-full bg-emerald-500 text-neutral-950 text-[10px] font-bold min-w-4 h-4 px-1">
                      {unread}
                    </span>
                  )}
                </NavLink>
                <NavLink href="/?spam=1">Potential spam</NavLink>
                <NavLink href="/blocked">Blocked</NavLink>
                <NavLink href="/knowledge">Knowledge</NavLink>
                <NavLink href="/settings">Settings</NavLink>
              </nav>
            </div>
          </header>
          <main className="mx-auto max-w-5xl px-5 py-6">{children}</main>
        </div>
      </body>
    </html>
  )
}

function NavLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="px-3 py-1.5 rounded-lg text-neutral-300 hover:text-white hover:bg-neutral-800 transition-colors"
    >
      {children}
    </Link>
  )
}
