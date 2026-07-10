import { NextResponse } from "next/server"
import { config } from "@/lib/config"
import { createCall, isBlocked } from "@/lib/db"
import { formParams, isValidTwilioRequest } from "@/lib/telephony/validate-signature"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

function xml(body: string) {
  return new NextResponse(`<?xml version="1.0" encoding="UTF-8"?>${body}`, {
    headers: { "Content-Type": "text/xml" },
  })
}

function esc(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")
}

export async function POST(request: Request) {
  let form: FormData
  try {
    form = await request.formData()
  } catch {
    return new NextResponse("Bad request", { status: 400 })
  }

  // Reject forged webhooks before doing any work.
  if (!isValidTwilioRequest(request, "/api/voice/incoming", formParams(form))) {
    return new NextResponse("Invalid Twilio signature", { status: 403 })
  }

  const from = String(form.get("From") || "unknown")
  const to = String(form.get("To") || "")
  const callSid = String(form.get("CallSid") || "")

  // Reject blocked numbers before any AI runs.
  if (from !== "unknown" && (await isBlocked(from))) {
    return xml(`<Response><Reject reason="rejected"/></Response>`)
  }

  const call = await createCall({ twilioCallSid: callSid || null, fromNumber: from, toNumber: to })

  // Public host Twilio should open the media websocket against.
  const host =
    config.publicHost ||
    request.headers.get("x-forwarded-host") ||
    request.headers.get("host") ||
    ""
  const wsUrl = `wss://${host.replace(/^https?:\/\//, "")}/media`

  return xml(
    `<Response>` +
      `<Connect>` +
      `<Stream url="${esc(wsUrl)}">` +
      `<Parameter name="callId" value="${call.id}"/>` +
      `<Parameter name="from" value="${esc(from)}"/>` +
      `</Stream>` +
      `</Connect>` +
      `</Response>`,
  )
}
