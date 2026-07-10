import { NextResponse } from "next/server"
import { query, type BlockedNumber } from "@/lib/db"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET() {
  const blocked = await query<BlockedNumber>(`SELECT * FROM blocked_numbers ORDER BY created_at DESC`)
  return NextResponse.json({ blocked })
}

export async function POST(request: Request) {
  const { number, reason } = await request.json().catch(() => ({}))
  if (!number || typeof number !== "string") {
    return NextResponse.json({ error: "number required" }, { status: 400 })
  }
  await query(
    `INSERT INTO blocked_numbers (number, reason) VALUES ($1, $2)
     ON CONFLICT (number) DO UPDATE SET reason = EXCLUDED.reason`,
    [number.trim(), reason?.trim() || null],
  )
  return NextResponse.json({ ok: true })
}

export async function DELETE(request: Request) {
  const number = new URL(request.url).searchParams.get("number")
  if (!number) return NextResponse.json({ error: "number required" }, { status: 400 })
  await query(`DELETE FROM blocked_numbers WHERE number = $1`, [number])
  return NextResponse.json({ ok: true })
}
