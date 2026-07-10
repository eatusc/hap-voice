import { NextResponse } from "next/server"
import { getSettings, updateSettings } from "@/lib/settings"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET() {
  return NextResponse.json(await getSettings())
}

export async function PUT(request: Request) {
  const patch = await request.json().catch(() => ({}))
  const updated = await updateSettings(patch)
  return NextResponse.json(updated)
}
