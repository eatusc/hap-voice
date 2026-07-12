import { NextResponse } from "next/server"
import { config } from "@/lib/config"
import { createCall, isBlocked, updateCall } from "@/lib/db"
import { registerRetellCall } from "@/lib/retell"
import { getSettings } from "@/lib/settings"
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

  // Reject blocked numbers before any AI runs (either provider).
  if (from !== "unknown" && (await isBlocked(from))) {
    return xml(`<Response><Reject reason="rejected"/></Response>`)
  }

  const call = await createCall({ twilioCallSid: callSid || null, fromNumber: from, toNumber: to })

  // Retell provider: register the call and bridge it to the Retell agent over
  // SIP. Selected live from the Settings page — the Twilio number keeps
  // pointing here either way. Any failure falls through to the local pipeline
  // so a Retell outage can't take the phone line down.
  const settings = await getSettings()
  if (settings.voiceProvider === "retell") {
    // Agent id may come from provisioning (settings) or from .env.local.
    if (config.retell.apiKey && (settings.retellAgentId || config.retell.agentId)) {
      try {
        const { callId, sipUri } = await registerRetellCall({
          fromNumber: from,
          toNumber: to || null,
          localCallId: Number(call.id),
        })
        await updateCall(Number(call.id), { voice_provider: "retell", retell_call_id: callId })
        console.log(`[voice incoming] → retell agent, local id ${call.id}`)
        // action: if the SIP bridge fails, /api/voice/dial-status reclaims the
        // call for the local pipeline instead of dropping it.
        return xml(
          `<Response><Dial answerOnBridge="true" action="/api/voice/dial-status" method="POST">` +
            `<Sip>${esc(sipUri)}</Sip></Dial></Response>`,
        )
      } catch (err) {
        console.error(
          "[voice incoming] retell handoff failed, falling back to local pipeline:",
          (err as Error).message,
        )
      }
    } else {
      console.warn("[voice incoming] provider is retell but RETELL_API_KEY/RETELL_AGENT_ID missing — using local pipeline")
    }
  }

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
