import { NextResponse } from "next/server"
import {
  createRetellCall,
  getCallByRetellId,
  queryOne,
  replaceTurns,
  updateCall,
  type Call,
} from "@/lib/db"
import { verifyRetellSignature } from "@/lib/retell"
import { getSettings } from "@/lib/settings"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

// Retell call-event webhook (call_started / call_ended / call_analyzed).
// Retell retries deliveries until it gets a 2xx, so everything here is
// idempotent: the same event applied twice produces the same DB state.
// Bodies are never logged (they carry caller data and transcripts).

const HANDLED_EVENTS = new Set(["call_started", "call_ended", "call_analyzed"])

// Retell disconnection_reason values that mean the call never went through.
const FAILURE_REASON = /^(error|dial_failed|dial_busy|dial_no_answer|concurrency_limit|no_valid_payment|scam_detected|registered_call_timeout)/

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

  const event = typeof payload?.event === "string" ? payload.event : ""
  const call = payload?.call
  const retellCallId = typeof call?.call_id === "string" && call.call_id ? call.call_id : null

  // Valid-but-unsupported events (transcript_updated, transfer_*, …) are
  // acknowledged so Retell stops retrying them.
  if (!HANDLED_EVENTS.has(event)) return NextResponse.json({ ok: true, ignored: event || true })
  if (!retellCallId) return new NextResponse("Missing call_id", { status: 400 })

  const record = await findOrCreateCall(call, retellCallId)

  // A call the local pipeline reclaimed (e.g. the SIP dial failed and the
  // fallback answered): the registered Retell call still times out and emits
  // events — ignore them so they can't clobber the live local conversation.
  if (record.voice_provider === "local" && !record.retell_call_id) {
    console.log(`[retell events] ${event} ignored — call ${record.id} was reclaimed by the local pipeline`)
    return NextResponse.json({ ok: true, ignored: true })
  }

  const patch: Partial<Call> = {}

  // Adopt the Retell call id / provider on records created by the inbound hook.
  if (record.retell_call_id !== retellCallId) patch.retell_call_id = retellCallId
  if (record.voice_provider !== "retell") patch.voice_provider = "retell"

  if (typeof call.start_timestamp === "number") {
    patch.started_at = new Date(call.start_timestamp).toISOString()
  }

  if (event === "call_started") {
    // Never regress a finished call — webhook retries can arrive out of order,
    // so a late call_started must not reopen a call call_ended already closed.
    if (record.status === "in_progress") patch.status = "in_progress"
  } else {
    // call_ended and call_analyzed both carry final call state.
    const reason = str(call.disconnection_reason)
    patch.status = reason && FAILURE_REASON.test(reason) ? "failed" : "completed"
    if (reason) patch.disconnection_reason = reason
    if (typeof call.end_timestamp === "number") {
      patch.ended_at = new Date(call.end_timestamp).toISOString()
      if (typeof call.start_timestamp === "number") {
        patch.duration_seconds = Math.max(0, Math.round((call.end_timestamp - call.start_timestamp) / 1000))
      }
    }
    const recording = str(call.recording_url)
    if (recording) patch.recording_url = recording

    const turns = mapTranscript(call.transcript_object)
    if (turns.length > 0) await replaceTurns(record.id, turns)
  }

  if (event === "call_analyzed") {
    Object.assign(patch, await mapAnalysis(call.call_analysis))
  }

  await updateCall(record.id, patch)
  console.log(`[retell events] ${event} → call ${record.id}`)
  return NextResponse.json({ ok: true })
}

// Prefer the metadata.local_call_id we attached at inbound time, then the
// Retell call id, then create a fallback record (e.g. events arriving for a
// call whose inbound webhook never reached us).
async function findOrCreateCall(call: any, retellCallId: string): Promise<Call> {
  const localId = Number(call?.metadata?.local_call_id)
  if (Number.isInteger(localId) && localId > 0) {
    const byLocal = await queryOne<Call>(`SELECT * FROM calls WHERE id = $1`, [localId])
    if (byLocal) return byLocal
  }
  const byRetell = await getCallByRetellId(retellCallId)
  if (byRetell) return byRetell
  return createRetellCall({
    retellCallId,
    fromNumber: str(call?.from_number) ?? "unknown",
    toNumber: str(call?.to_number),
  })
}

function str(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null
}

// Retell roles → local roles. 'agent' speaks for us, 'user' is the caller;
// anything else (transfer targets etc.) is dropped.
function mapTranscript(transcriptObject: unknown): { role: "caller" | "assistant"; text: string }[] {
  if (!Array.isArray(transcriptObject)) return []
  const turns: { role: "caller" | "assistant"; text: string }[] = []
  for (const t of transcriptObject) {
    const role = t?.role === "agent" ? "assistant" : t?.role === "user" ? "caller" : null
    const text = str(t?.content)
    if (role && text) turns.push({ role, text })
  }
  return turns
}

// Map Retell post-call analysis onto the existing extraction columns. The
// custom fields come from the agent's post-call analysis config (see RETELL.md)
// and may be missing or oddly typed — only well-formed values are applied.
async function mapAnalysis(analysis: any): Promise<Partial<Call>> {
  if (!analysis || typeof analysis !== "object") return {}
  const custom = analysis.custom_analysis_data ?? {}
  const patch: Partial<Call> = {}

  const fields = ["caller_name", "caller_company", "caller_email", "reason", "callback_number", "message"] as const
  for (const f of fields) {
    const v = str(custom[f])
    if (v) patch[f] = v
  }

  const summary = str(custom.summary) ?? str(analysis.call_summary)
  if (summary) patch.summary = summary

  const spamScore = num(custom.spam_score)
  if (spamScore != null) patch.spam_score = Math.max(0, Math.min(1, spamScore))
  const spamReason = str(custom.spam_reason)
  if (spamReason) patch.spam_reason = spamReason

  const isSpam = bool(custom.is_spam)
  if (isSpam != null) {
    patch.is_spam = isSpam
  } else if (patch.spam_score != null) {
    patch.is_spam = patch.spam_score >= (await getSettings()).spamThreshold
  }

  return patch
}

function num(v: unknown): number | null {
  const n = typeof v === "string" ? Number(v) : typeof v === "number" ? v : NaN
  return Number.isFinite(n) ? n : null
}

function bool(v: unknown): boolean | null {
  if (typeof v === "boolean") return v
  if (v === "true") return true
  if (v === "false") return false
  return null
}
