import { NextResponse } from "next/server"
import { queryOne, updateCall, type Call } from "@/lib/db"
import { formParams, isValidTwilioRequest } from "@/lib/telephony/validate-signature"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

// Twilio call status callback. Backstop that marks a call completed even if the
// media websocket closed abnormally.
export async function POST(request: Request) {
  let form: FormData
  try {
    form = await request.formData()
  } catch {
    return new NextResponse("Bad request", { status: 400 })
  }

  // Reject forged callbacks — same policy as the other Twilio webhooks.
  if (!isValidTwilioRequest(request, "/api/voice/status", formParams(form))) {
    return new NextResponse("Invalid Twilio signature", { status: 403 })
  }

  const callSid = String(form.get("CallSid") || "")
  const callStatus = String(form.get("CallStatus") || "")

  if (callSid && (callStatus === "completed" || callStatus === "failed")) {
    const call = await queryOne<Call>(`SELECT * FROM calls WHERE twilio_call_sid = $1`, [callSid])
    if (call && call.status === "in_progress") {
      await updateCall(call.id, {
        status: callStatus === "failed" ? "failed" : "completed",
        ended_at: new Date().toISOString(),
      })
    }
  }
  return NextResponse.json({ ok: true })
}
