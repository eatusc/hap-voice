import { NextResponse } from "next/server"
import { insertMessage } from "@/lib/db"
import { detectVerificationCode } from "@/lib/verification-code"
import { formParams, isValidTwilioRequest } from "@/lib/telephony/validate-signature"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

function twiml(body = "") {
  const inner = body ? `<Message>${body}</Message>` : ""
  return new NextResponse(`<?xml version="1.0" encoding="UTF-8"?><Response>${inner}</Response>`, {
    headers: { "Content-Type": "text/xml" },
  })
}

// Twilio inbound SMS/MMS webhook. Stores the message and returns empty TwiML
// (no auto-reply). Point Twilio's Messaging "A message comes in" webhook here.
export async function POST(request: Request) {
  let form: FormData
  try {
    form = await request.formData()
  } catch {
    return new NextResponse("Bad request", { status: 400 })
  }

  // Reject forged webhooks before storing anything.
  if (!isValidTwilioRequest(request, "/api/sms/incoming", formParams(form))) {
    return new NextResponse("Invalid Twilio signature", { status: 403 })
  }

  const from = String(form.get("From") || "unknown")
  const to = String(form.get("To") || "")
  const body = String(form.get("Body") || "")
  const messageSid = String(form.get("MessageSid") || form.get("SmsMessageSid") || "")
  const numMedia = parseInt(String(form.get("NumMedia") || "0"), 10) || 0

  const mediaUrls: string[] = []
  for (let i = 0; i < numMedia; i++) {
    const url = form.get(`MediaUrl${i}`)
    if (url) mediaUrls.push(String(url))
  }

  await insertMessage({
    twilioMessageSid: messageSid || null,
    direction: "inbound",
    fromNumber: from,
    toNumber: to,
    body,
    numMedia,
    mediaUrls: mediaUrls.length ? mediaUrls : null,
    detectedCode: detectVerificationCode(body),
  })

  return twiml()
}
