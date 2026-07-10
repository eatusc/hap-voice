import { NextResponse } from "next/server"
import { getTurns, queryOne, updateCall, type Call } from "@/lib/db"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const call = await queryOne<Call>(`SELECT * FROM calls WHERE id = $1`, [Number(id)])
  if (!call) return NextResponse.json({ error: "Not found" }, { status: 404 })
  const turns = await getTurns(call.id)
  return NextResponse.json({ call, turns })
}

// Human override of the spam verdict — the correction the system should trust.
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const body = await req.json().catch(() => ({}))
  if (typeof body.is_spam !== "boolean") {
    return NextResponse.json({ error: "is_spam boolean required" }, { status: 400 })
  }
  await updateCall(Number(id), {
    is_spam: body.is_spam,
    spam_reason: body.is_spam ? "Marked as spam by you" : "Marked not spam by you",
  })
  return NextResponse.json({ ok: true })
}
