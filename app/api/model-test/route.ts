import { NextResponse } from "next/server"
import { generateReply } from "@/lib/llm/openrouter"
import type { AppSettings } from "@/lib/settings"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

// Runs one caller message through the given (unsaved) model, using the live
// persona + knowledge base, so the Settings page can A/B models before saving.
export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}))
  const message = String(body.message || "").slice(0, 1000).trim()
  if (!message) return NextResponse.json({ error: "Type a message first." }, { status: 400 })

  const override: Partial<AppSettings> = {}
  if (body.llmModel) override.llmModel = String(body.llmModel)
  if (body.businessName) override.businessName = String(body.businessName)

  const started = Date.now()
  try {
    const reply = await generateReply([{ role: "user", content: message }], override)
    return NextResponse.json({ reply, ms: Date.now() - started, model: override.llmModel })
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}
