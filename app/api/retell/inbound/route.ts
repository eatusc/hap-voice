import { NextResponse } from "next/server"
import { createRetellCall, isBlocked } from "@/lib/db"
import { getRetellAgentId, verifyRetellSignature } from "@/lib/retell"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

// Retell inbound-call webhook: Retell POSTs `call_inbound` while the phone is
// still ringing, and the response decides what happens. Returning a
// `call_inbound` object WITHOUT `override_agent_id` declines the call — that's
// Retell's documented rejection mechanism, used here for blocked numbers.
//
// Must respond well inside Retell's 10s webhook timeout, so this only does two
// quick DB queries. Bodies are never logged (they carry caller data).

function decline() {
  return NextResponse.json({ call_inbound: {} })
}

export async function POST(request: Request) {
  const raw = await request.text()
  if (!verifyRetellSignature(raw, request.headers.get("x-retell-signature"))) {
    return new NextResponse("Invalid Retell signature", { status: 401 })
  }

  let payload: any
  try {
    payload = JSON.parse(raw)
  } catch {
    return new NextResponse("Bad request", { status: 400 })
  }

  // This endpoint only acts on call_inbound; acknowledge anything else so
  // Retell doesn't retry it.
  if (payload?.event !== "call_inbound") return NextResponse.json({})

  const inbound = payload.call_inbound ?? {}
  const from = typeof inbound.from_number === "string" && inbound.from_number ? inbound.from_number : "unknown"
  const to = typeof inbound.to_number === "string" && inbound.to_number ? inbound.to_number : null

  if (from !== "unknown" && (await isBlocked(from))) {
    console.log("[retell inbound] declined blocked caller")
    return decline()
  }

  const agentId = await getRetellAgentId()
  if (!agentId) {
    console.warn("[retell inbound] no Retell agent configured — declining call")
    return decline()
  }

  const call = await createRetellCall({ fromNumber: from, toNumber: to })
  console.log(`[retell inbound] accepted call, local id ${call.id}`)

  return NextResponse.json({
    call_inbound: {
      override_agent_id: agentId,
      // Round-trips through Retell and comes back on every event webhook, so
      // events can find this row even before retell_call_id is stored.
      // Number(): pg returns BIGSERIAL ids as strings.
      metadata: { local_call_id: Number(call.id), voice_provider: "retell" },
    },
  })
}
