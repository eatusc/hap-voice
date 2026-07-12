import { NextResponse } from "next/server"
import { config } from "@/lib/config"
import { queryOne, updateCall, type Call } from "@/lib/db"
import { formParams, isValidTwilioRequest } from "@/lib/telephony/validate-signature"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

// <Dial> action callback for Retell-bridged calls: Twilio requests this when
// the dial leg finishes and follows whatever TwiML we return. Two cases:
//
// - The bridge connected (DialCallStatus=completed/answered): the conversation
//   already happened on Retell — hang up cleanly.
// - The bridge failed (busy/no-answer/failed/canceled — e.g. Retell's SIP edge
//   is down even though register-phone-call succeeded): reclaim the call for
//   the local pipeline instead of leaving the caller in dead air. Clearing
//   retell_call_id also tells the events webhook to ignore the registered
//   call's timeout events so they can't clobber the live local conversation.

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

  if (!isValidTwilioRequest(request, "/api/voice/dial-status", formParams(form))) {
    return new NextResponse("Invalid Twilio signature", { status: 403 })
  }

  const callSid = String(form.get("CallSid") || "")
  const dialStatus = String(form.get("DialCallStatus") || "")

  if (dialStatus === "completed" || dialStatus === "answered") {
    return xml(`<Response><Hangup/></Response>`)
  }

  const call = callSid
    ? await queryOne<Call>(`SELECT * FROM calls WHERE twilio_call_sid = $1`, [callSid])
    : null
  if (!call) return xml(`<Response><Hangup/></Response>`)

  console.warn(`[dial-status] retell bridge ${dialStatus || "failed"} — reclaiming call ${call.id} for local pipeline`)
  await updateCall(call.id, { voice_provider: "local", retell_call_id: null, status: "in_progress" })

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
      `<Parameter name="from" value="${esc(call.from_number)}"/>` +
      `</Stream>` +
      `</Connect>` +
      `</Response>`,
  )
}
