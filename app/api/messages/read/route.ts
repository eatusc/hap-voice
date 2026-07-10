import { NextResponse } from "next/server"
import { markAllMessagesRead } from "@/lib/db"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function POST() {
  await markAllMessagesRead()
  return NextResponse.json({ ok: true })
}
