// Focused tests for the Retell webhook routes, exercised end-to-end against the
// local dev database (every row they create is cleaned up at the end):
//
//   npx tsx scripts/test-retell.ts   (or: npm run test:retell)
//
// Covers: signature rejection, blocked-caller rejection, accepted inbound
// metadata, duplicate event delivery, transcript role mapping, analysis mapping.

import "../lib/load-env" // must be first

// Route config is read at module-import time, so pin test credentials before
// the dynamic imports below. These are fake values, never real secrets.
process.env.RETELL_API_KEY = "test_retell_key_not_real"
// Deliberately NO env agent id — production uses an app-provisioned agent
// stored in settings, and the routes must work from that alone.
process.env.RETELL_AGENT_ID = ""
process.env.RETELL_SKIP_VALIDATION = "false"
process.env.TWILIO_SKIP_VALIDATION = "true"

const API_KEY = process.env.RETELL_API_KEY
const AGENT_ID = "agent_test_123"
const BLOCKED = "+19995550001"
const CALLER = "+19995550002"
const RETELL_ID = `test_call_${Date.now()}`

let passed = 0
let failed = 0
function check(name: string, cond: boolean, extra?: unknown) {
  if (cond) {
    passed++
    console.log(`  ✔ ${name}`)
  } else {
    failed++
    console.error(`  ✘ ${name}`, extra ?? "")
  }
}

async function main() {
  const { signRetellBody } = await import("../lib/retell")
  const { POST: inbound } = await import("../app/api/retell/inbound/route")
  const { POST: events } = await import("../app/api/retell/events/route")
  const { pool, query, queryOne, getTurns } = await import("../lib/db")
  const { getSettings, updateSettings } = await import("../lib/settings")

  // Mirror production: the agent id lives in app settings (provisioned), not env.
  const original = await getSettings()
  await updateSettings({ retellAgentId: AGENT_ID })

  // sig: undefined → sign correctly; null → omit header; string → send as-is.
  function post(path: string, body: unknown, sig?: string | null) {
    const raw = JSON.stringify(body)
    const headers: Record<string, string> = { "content-type": "application/json" }
    const signature = sig === undefined ? signRetellBody(raw, API_KEY) : sig
    if (signature) headers["x-retell-signature"] = signature
    return new Request(`http://localhost${path}`, { method: "POST", headers, body: raw })
  }

  try {
    // ── Signature verification ───────────────────────────────────────────
    console.log("signature verification")
    const probe = { event: "call_started", call: { call_id: RETELL_ID } }
    check("missing signature → 401", (await events(post("/api/retell/events", probe, null))).status === 401)
    check("garbage signature → 401", (await events(post("/api/retell/events", probe, "v=1,d=deadbeef"))).status === 401)
    const stale = signRetellBody(JSON.stringify(probe), API_KEY, Date.now() - 10 * 60 * 1000)
    check("stale (10 min old) signature → 401", (await events(post("/api/retell/events", probe, stale))).status === 401)
    check(
      "wrong-key signature → 401",
      (await events(post("/api/retell/events", probe, signRetellBody(JSON.stringify(probe), "other_key")))).status === 401,
    )
    check(
      "inbound also rejects bad signatures → 401",
      (await inbound(post("/api/retell/inbound", { event: "call_inbound" }, null))).status === 401,
    )

    // ── Inbound: blocked caller ──────────────────────────────────────────
    console.log("inbound webhook")
    await query(
      `INSERT INTO blocked_numbers (number, reason) VALUES ($1, 'retell-test') ON CONFLICT (number) DO NOTHING`,
      [BLOCKED],
    )
    let res = await inbound(
      post("/api/retell/inbound", {
        event: "call_inbound",
        call_inbound: { from_number: BLOCKED, to_number: "+19995550100" },
      }),
    )
    let j = await res.json()
    check("blocked caller → 200", res.status === 200)
    check(
      "blocked caller → declined (no override_agent_id)",
      !!j.call_inbound && !("override_agent_id" in j.call_inbound),
      j,
    )

    // ── Inbound: accepted caller ─────────────────────────────────────────
    res = await inbound(
      post("/api/retell/inbound", {
        event: "call_inbound",
        call_inbound: { from_number: CALLER, to_number: "+19995550100" },
      }),
    )
    j = await res.json()
    const localId = j?.call_inbound?.metadata?.local_call_id
    check("accepted caller → 200", res.status === 200)
    check("accepted → override_agent_id", j?.call_inbound?.override_agent_id === AGENT_ID, j)
    check("accepted → metadata.local_call_id is an id", Number.isInteger(localId) && localId > 0, j)
    check("accepted → metadata.voice_provider retell", j?.call_inbound?.metadata?.voice_provider === "retell")
    let row = await queryOne(`SELECT * FROM calls WHERE id = $1`, [localId])
    check("call row created with voice_provider retell", row?.voice_provider === "retell")
    check("call row records caller", row?.from_number === CALLER)

    // ── Events: call_started ─────────────────────────────────────────────
    console.log("event webhook")
    const t0 = Date.now() - 63_000
    const meta = { local_call_id: localId, voice_provider: "retell" }
    res = await events(
      post("/api/retell/events", {
        event: "call_started",
        call: { call_id: RETELL_ID, metadata: meta, from_number: CALLER, start_timestamp: t0 },
      }),
    )
    check("call_started → 200", res.status === 200)
    row = await queryOne(`SELECT * FROM calls WHERE id = $1`, [localId])
    check("call_started stores retell_call_id", row?.retell_call_id === RETELL_ID)
    check("call_started keeps status in_progress", row?.status === "in_progress")

    // ── Events: call_ended (delivered twice → identical state) ───────────
    const transcript = [
      { role: "agent", content: "Thanks for calling HelpAProduct, who am I speaking with?" },
      { role: "user", content: "Hi, it's Pat from Acme about pricing." },
      { role: "tool_call_invocation", content: "ignored" },
      { role: "agent", content: "Great — what's the best callback number?" },
    ]
    const endedBody = {
      event: "call_ended",
      call: {
        call_id: RETELL_ID,
        metadata: meta,
        start_timestamp: t0,
        end_timestamp: t0 + 63_000,
        disconnection_reason: "user_hangup",
        recording_url: "https://example.com/recording.wav",
        transcript_object: transcript,
      },
    }
    check("call_ended → 200", (await events(post("/api/retell/events", endedBody))).status === 200)
    check("duplicate call_ended → 200", (await events(post("/api/retell/events", endedBody))).status === 200)
    row = await queryOne(`SELECT * FROM calls WHERE id = $1`, [localId])
    check("call_ended → status completed", row?.status === "completed")
    check("call_ended → duration 63s", row?.duration_seconds === 63, row?.duration_seconds)
    check("call_ended → disconnection_reason", row?.disconnection_reason === "user_hangup")
    check("call_ended → recording_url", row?.recording_url === "https://example.com/recording.wav")
    let turns = await getTurns(localId)
    check("duplicate delivery does not duplicate turns", turns.length === 3, turns.length)
    check("role agent → assistant", turns[0]?.role === "assistant" && turns[2]?.role === "assistant")
    check("role user → caller", turns[1]?.role === "caller")
    check("unknown roles dropped", turns.every((t) => t.text !== "ignored"))

    // ── Events: call_analyzed (mapping + duplicate delivery) ─────────────
    const analyzedBody = {
      event: "call_analyzed",
      call: {
        ...endedBody.call,
        call_analysis: {
          call_summary: "Pat from Acme called about pricing.",
          user_sentiment: "Positive",
          custom_analysis_data: {
            caller_name: "Pat",
            caller_company: "Acme",
            caller_email: "pat@acme.test",
            reason: "Pricing question",
            callback_number: "+14155550123",
            message: "Please call back today.",
            spam_score: "0.15",
            spam_reason: "Named a real company and a callback number.",
          },
        },
      },
    }
    check("call_analyzed → 200", (await events(post("/api/retell/events", analyzedBody))).status === 200)
    check("duplicate call_analyzed → 200", (await events(post("/api/retell/events", analyzedBody))).status === 200)
    // Retell retries can arrive out of order — a late call_started must not
    // reopen a call that call_ended already closed.
    await events(
      post("/api/retell/events", {
        event: "call_started",
        call: { call_id: RETELL_ID, metadata: meta, start_timestamp: t0 },
      }),
    )
    row = await queryOne(`SELECT * FROM calls WHERE id = $1`, [localId])
    check("late call_started does not reopen a completed call", row?.status === "completed", row?.status)
    row = await queryOne(`SELECT * FROM calls WHERE id = $1`, [localId])
    check("analysis → caller_name", row?.caller_name === "Pat")
    check("analysis → caller_company", row?.caller_company === "Acme")
    check("analysis → caller_email", row?.caller_email === "pat@acme.test")
    check("analysis → reason", row?.reason === "Pricing question")
    check("analysis → callback_number", row?.callback_number === "+14155550123")
    check("analysis → message", row?.message === "Please call back today.")
    check("analysis → summary falls back to call_summary", row?.summary === "Pat from Acme called about pricing.")
    check("analysis → spam_score coerced from string", Math.abs((row?.spam_score ?? 1) - 0.15) < 1e-6, row?.spam_score)
    const threshold = (await getSettings()).spamThreshold
    check("analysis → is_spam derived from threshold", row?.is_spam === 0.15 >= threshold, { is_spam: row?.is_spam, threshold })
    turns = await getTurns(localId)
    check("transcript still 3 turns after analyze", turns.length === 3, turns.length)

    // ── Events: fallback record + unsupported events ─────────────────────
    const orphanId = `${RETELL_ID}_orphan`
    res = await events(
      post("/api/retell/events", {
        event: "call_ended",
        call: { call_id: orphanId, from_number: CALLER, disconnection_reason: "dial_failed" },
      }),
    )
    check("event without local record → 200", res.status === 200)
    const orphan = await queryOne(`SELECT * FROM calls WHERE retell_call_id = $1`, [orphanId])
    check("fallback record created", orphan?.voice_provider === "retell", orphan)
    check("failure reason → status failed", orphan?.status === "failed")
    res = await events(post("/api/retell/events", { event: "transcript_updated", call: { call_id: RETELL_ID } }))
    check("unsupported event acknowledged with 2xx", res.status === 200)

    // ── Live provider switch (Twilio voice webhook) ──────────────────────
    console.log("voice provider switch")
    const { POST: incoming } = await import("../app/api/voice/incoming/route")

    let registerBody: any = null
    let failRegister = false
    const realFetch = globalThis.fetch
    globalThis.fetch = (async (url: any, init?: any) => {
      if (String(url).includes("/v2/register-phone-call")) {
        if (failRegister) return new Response("boom", { status: 500 })
        registerBody = JSON.parse(init?.body)
        return Response.json({ call_id: "test_reg_abc" })
      }
      return realFetch(url, init)
    }) as typeof fetch

    function twilioPost(path: string, params: Record<string, string>) {
      return new Request(`http://localhost${path}`, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams(params).toString(),
      })
    }
    const IN = "/api/voice/incoming"
    const bridgedSid = `CAtest1${Date.now()}`

    try {
      await updateSettings({ voiceProvider: "retell" })
      let r = await incoming(twilioPost(IN, { From: CALLER, To: "+19995550100", CallSid: bridgedSid }))
      let twiml = await r.text()
      check("retell selected → <Dial><Sip> TwiML", twiml.includes("<Dial") && twiml.includes("sip:test_reg_abc@"), twiml)
      check("register uses the configured agent id", registerBody?.agent_id === "agent_test_123", registerBody)
      check("register metadata carries local_call_id", Number.isInteger(registerBody?.metadata?.local_call_id))
      const bridged = await queryOne(`SELECT * FROM calls WHERE id = $1`, [registerBody.metadata.local_call_id])
      check(
        "bridged call stored as retell with call id",
        bridged?.voice_provider === "retell" && bridged?.retell_call_id === "test_reg_abc",
        bridged,
      )

      failRegister = true
      r = await incoming(twilioPost(IN, { From: CALLER, To: "+19995550100", CallSid: `CAtest2${Date.now()}` }))
      twiml = await r.text()
      check("retell handoff failure → local <Connect><Stream> fallback", twiml.includes("<Connect>") && twiml.includes("/media"), twiml)

      r = await incoming(twilioPost(IN, { From: BLOCKED, To: "+19995550100", CallSid: `CAtest3${Date.now()}` }))
      check("blocked caller still rejected in retell mode", (await r.text()).includes("<Reject"))

      await updateSettings({ voiceProvider: "local" })
      r = await incoming(twilioPost(IN, { From: CALLER, To: "+19995550100", CallSid: `CAtest4${Date.now()}` }))
      check("switch back to local → <Connect><Stream>", (await r.text()).includes("<Connect>"))

      // ── Dial action: bridge outcome handling ──────────────────────────
      console.log("dial-status fallback")
      const { POST: dialStatus } = await import("../app/api/voice/dial-status/route")
      const DS = "/api/voice/dial-status"
      r = await dialStatus(twilioPost(DS, { CallSid: bridgedSid, DialCallStatus: "completed" }))
      check("bridge completed → <Hangup/>", (await r.text()).includes("<Hangup"), undefined)
      let bridgedRow = await queryOne(`SELECT * FROM calls WHERE twilio_call_sid = $1`, [bridgedSid])
      check("completed bridge keeps retell ownership", bridgedRow?.voice_provider === "retell")

      r = await dialStatus(twilioPost(DS, { CallSid: bridgedSid, DialCallStatus: "failed" }))
      twiml = await r.text()
      check("bridge failed → reclaimed with <Connect><Stream>", twiml.includes("<Connect>") && twiml.includes("callId"), twiml)
      bridgedRow = await queryOne(`SELECT * FROM calls WHERE twilio_call_sid = $1`, [bridgedSid])
      check(
        "reclaimed call flipped to local, retell id cleared",
        bridgedRow?.voice_provider === "local" && bridgedRow?.retell_call_id === null,
        bridgedRow,
      )

      // The registered Retell call later times out — its events must not
      // clobber the reclaimed local conversation.
      res = await events(
        post("/api/retell/events", {
          event: "call_ended",
          call: {
            call_id: "test_reg_abc",
            metadata: { local_call_id: bridgedRow!.id },
            disconnection_reason: "registered_call_timeout",
          },
        }),
      )
      check("timeout event for reclaimed call → 2xx ack", res.status === 200)
      bridgedRow = await queryOne(`SELECT * FROM calls WHERE twilio_call_sid = $1`, [bridgedSid])
      check(
        "reclaimed call untouched by stale retell events",
        bridgedRow?.voice_provider === "local" && bridgedRow?.status === "in_progress",
        bridgedRow,
      )
    } finally {
      globalThis.fetch = realFetch
      await updateSettings({ voiceProvider: original.voiceProvider, retellAgentId: original.retellAgentId })
    }

    // ── Cleanup ──────────────────────────────────────────────────────────
    await query(
      `DELETE FROM calls
        WHERE id = $1 OR retell_call_id LIKE $2 OR retell_call_id LIKE 'test_reg_%'
           OR twilio_call_sid LIKE 'CAtest%'`,
      [localId, `${RETELL_ID}%`],
    )
    await query(`DELETE FROM blocked_numbers WHERE number = $1 AND reason = 'retell-test'`, [BLOCKED])
  } finally {
    await pool.end()
  }

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed > 0) process.exit(1)
}

main().catch((err) => {
  console.error("test-retell failed:", err)
  process.exit(1)
})
