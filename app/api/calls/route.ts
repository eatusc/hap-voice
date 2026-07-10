import { NextResponse } from "next/server"
import { query, type Call } from "@/lib/db"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(request: Request) {
  const url = new URL(request.url)
  const spamOnly = url.searchParams.get("spam") === "1"
  const q = url.searchParams.get("q")?.trim()

  const where: string[] = []
  const params: any[] = []
  if (spamOnly) where.push("is_spam = true")
  if (q) {
    params.push(`%${q}%`)
    where.push(`(from_number ILIKE $${params.length} OR caller_name ILIKE $${params.length} OR caller_company ILIKE $${params.length})`)
  }
  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : ""

  const calls = await query<Call>(
    `SELECT * FROM calls ${whereSql} ORDER BY started_at DESC LIMIT 200`,
    params,
  )
  return NextResponse.json({ calls })
}
