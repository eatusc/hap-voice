import { NextResponse } from "next/server"
import { listMessages } from "@/lib/db"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET() {
  const messages = await listMessages(200)
  return NextResponse.json({ messages })
}
