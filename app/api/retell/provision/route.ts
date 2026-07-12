import { NextResponse } from "next/server"
import { provisionRetellAgent } from "@/lib/retell"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

// Dashboard action: create (or re-sync) the Retell agent from the app's own
// prompt, greeting, and knowledge base. Same trust level as /api/settings —
// it's the local dashboard talking to its own server; secrets never transit.
export async function POST() {
  try {
    const result = await provisionRetellAgent()
    return NextResponse.json(result)
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 400 })
  }
}
