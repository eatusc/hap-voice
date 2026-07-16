import { NextResponse } from "next/server"
import { deleteDataForNumber } from "@/lib/db"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

// Right-to-erasure endpoint: given a phone number, permanently delete every
// stored trace of it — calls (transcripts, extracted name/email/message, spam
// notes) and SMS/MMS (bodies, detected OTP codes). This is where "delete my
// data" requests are serviced.
//
// The dashboard APIs are tailnet-only (the cloudflared tunnel 404s everything
// but the telephony webhooks), so this is an operator action and is never
// reachable from the public internet.
export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}))
  const number = typeof body?.number === "string" ? body.number.trim() : ""

  // Require a full E.164 number so a stray "" or "+" can't wipe unrelated rows.
  if (!/^\+[1-9]\d{6,14}$/.test(number)) {
    return NextResponse.json(
      { error: "A phone number in E.164 format (e.g. +19995550100) is required." },
      { status: 400 },
    )
  }

  const result = await deleteDataForNumber(number)
  return NextResponse.json({ ok: true, deleted: result })
}
