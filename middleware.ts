import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth"

// Telephony webhooks Twilio/Retell POST to. These MUST stay open — they verify
// their own request signatures — and they match the paths the Cloudflare tunnel
// exposes publicly. Everything else (dashboard pages + data/admin APIs, incl.
// /api/retell/provision and /api/data-deletion) requires a login session.
//
// The /media Media-Streams websocket is upgraded by the custom server
// (server.ts), not routed through Next, so it never reaches this middleware.
const PUBLIC_PATHS = new Set([
  "/api/voice/incoming",
  "/api/voice/status",
  "/api/voice/dial-status",
  "/api/sms/incoming",
  "/api/retell/inbound",
  "/api/retell/events",
  // Auth surface itself.
  "/login",
  "/api/auth/login",
  "/api/auth/logout",
])

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl

  if (PUBLIC_PATHS.has(pathname)) return NextResponse.next()

  const token = req.cookies.get(SESSION_COOKIE)?.value
  if (await verifySessionToken(token, Date.now())) return NextResponse.next()

  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const url = req.nextUrl.clone()
  url.pathname = "/login"
  url.search = ""
  url.searchParams.set("next", pathname)
  return NextResponse.redirect(url)
}

export const config = {
  // Run on all routes except Next internals and static assets.
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
}
