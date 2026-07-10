import { NextResponse } from "next/server"
import { getTurns, queryOne, type Call } from "@/lib/db"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const call = await queryOne<Call>(`SELECT * FROM calls WHERE id = $1`, [Number(id)])
  if (!call) return NextResponse.json({ error: "Not found" }, { status: 404 })
  const turns = await getTurns(call.id)
  return NextResponse.json({ call, turns })
}
