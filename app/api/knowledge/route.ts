import { NextResponse } from "next/server"
import { readFile, writeFile } from "node:fs/promises"
import { join } from "node:path"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

function knowledgePath() {
  return join(process.cwd(), "knowledge.md")
}

export async function GET() {
  let content = ""
  try {
    content = await readFile(knowledgePath(), "utf8")
  } catch {
    /* file may not exist */
  }
  return NextResponse.json({ content })
}

export async function PUT(request: Request) {
  const { content } = await request.json().catch(() => ({ content: "" }))
  if (typeof content !== "string") {
    return NextResponse.json({ error: "content must be a string" }, { status: 400 })
  }
  await writeFile(knowledgePath(), content, "utf8")
  // getKnowledge() re-reads on mtime change, so this applies on the next call.
  return NextResponse.json({ ok: true })
}
