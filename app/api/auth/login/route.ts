import { NextResponse } from "next/server"
import { SESSION_COOKIE, SESSION_MAX_AGE, checkPassword, createSessionToken, isAuthConfigured } from "@/lib/auth"

export async function POST(req: Request) {
  if (!isAuthConfigured()) {
    return NextResponse.json(
      { error: "Dashboard auth is not configured. Set DASHBOARD_PASSWORD in .env.local." },
      { status: 503 },
    )
  }

  let password = ""
  try {
    password = String((await req.json())?.password ?? "")
  } catch {
    /* empty / malformed body → treated as wrong password */
  }

  if (!checkPassword(password)) {
    return NextResponse.json({ error: "Incorrect password." }, { status: 401 })
  }

  const res = NextResponse.json({ ok: true })
  res.cookies.set(SESSION_COOKIE, await createSessionToken(Date.now()), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_MAX_AGE,
  })
  return res
}
