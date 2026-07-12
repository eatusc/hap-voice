// Retell AI integration: webhook signature verification + readiness status.
//
// Retell signs every webhook with `x-retell-signature: v=<unix-ms>,d=<digest>`
// where digest = hex HMAC-SHA256 over (raw body + timestamp), keyed by the
// Retell API key, and rejects signatures older than 5 minutes. This mirrors the
// official retell-sdk's webhook_auth `verify` (dropped from the SDK in v5, so
// it lives here) with a timing-safe compare instead of the SDK's `===`.

import { createHmac, timingSafeEqual } from "node:crypto"
import { config } from "@/lib/config"
import { queryOne } from "@/lib/db"
import { getSettings, updateSettings } from "@/lib/settings"
import { systemPrompt } from "@/lib/llm/openrouter"

const MAX_SIGNATURE_AGE_MS = 5 * 60 * 1000

// True if the raw webhook body carries a valid Retell signature. Fails closed:
// with validation enabled, a missing key, header, or timestamp drift → false.
export function verifyRetellSignature(rawBody: string, signature: string | null): boolean {
  if (config.retell.skipValidation) return true
  if (!config.retell.apiKey || !signature) return false

  const match = /^v=(\d+),d=(.+)$/.exec(signature)
  if (!match) return false
  const timestamp = Number(match[1])
  if (!Number.isFinite(timestamp) || Math.abs(Date.now() - timestamp) > MAX_SIGNATURE_AGE_MS) {
    return false
  }

  const expected = createHmac("sha256", config.retell.apiKey)
    .update(rawBody + match[1])
    .digest("hex")
  const a = Buffer.from(match[2])
  const b = Buffer.from(expected)
  return a.length === b.length && timingSafeEqual(a, b)
}

export function signRetellBody(rawBody: string, apiKey: string, timestamp = Date.now()): string {
  const digest = createHmac("sha256", apiKey).update(rawBody + timestamp).digest("hex")
  return `v=${timestamp},d=${digest}`
}

// The agent to use: an agent the app provisioned (stored in app_settings) wins,
// falling back to a hand-configured RETELL_AGENT_ID from .env.local.
export async function getRetellAgentId(): Promise<string> {
  return (await getSettings()).retellAgentId || config.retell.agentId
}

// ─── Retell REST helper ──────────────────────────────────────────────────────

async function retellApi(method: string, path: string, body?: unknown): Promise<any> {
  const res = await fetch(`${config.retell.apiBase}${path}`, {
    method,
    headers: {
      authorization: `Bearer ${config.retell.apiKey}`,
      "content-type": "application/json",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(15_000),
  })
  // Status only — never echo response bodies, which can restate request data.
  if (!res.ok) throw new Error(`Retell ${method} ${path} → HTTP ${res.status}`)
  return res.json().catch(() => null)
}

// ─── Agent provisioning ──────────────────────────────────────────────────────

// The post-call extraction fields, mirroring what the local pipeline's
// extractCallDetails + scoreSpam produce. The events webhook maps these
// custom_analysis_data keys straight onto the calls columns.
const ANALYSIS_FIELDS = [
  { type: "string", name: "caller_name", description: "The caller's name, if they gave one." },
  { type: "string", name: "caller_company", description: "The company the caller is with, if mentioned." },
  { type: "string", name: "caller_email", description: "The caller's email address exactly as given.", examples: ["pat@acme.com"] },
  { type: "string", name: "reason", description: "Why they called, in one sentence." },
  { type: "string", name: "callback_number", description: "Callback phone number in E.164 format, if given.", examples: ["+14155551212"] },
  { type: "string", name: "message", description: "The message the caller wants passed along, in their own words." },
  { type: "string", name: "summary", description: "One or two sentence summary of the call." },
  { type: "number", name: "spam_score", description: "0.0 = clearly a legitimate caller, 1.0 = clearly spam, a robocall, or a cold sales pitch. Use the full range." },
  { type: "string", name: "spam_reason", description: "One sentence explaining the spam score." },
  { type: "boolean", name: "is_spam", description: "True if this call is spam, a robocall, or an unsolicited cold sales pitch." },
]

export interface ProvisionResult {
  agentId: string
  created: boolean
}

// Create — or re-sync — the Retell agent from what the app already knows: the
// receptionist system prompt (with the live knowledge base baked in, exactly as
// the local pipeline uses it), the greeting, and the analysis fields above. The
// agent's webhook is pointed at /api/retell/events, so no Retell dashboard
// configuration is needed. Re-run after editing the greeting or knowledge base.
export async function provisionRetellAgent(): Promise<ProvisionResult> {
  if (!config.retell.apiKey) throw new Error("Set RETELL_API_KEY in .env.local first.")
  const status = await getRetellStatus()
  if (!status.eventsUrl) throw new Error("Set PUBLIC_HOST in .env.local first (needed for the event webhook URL).")

  const settings = await getSettings()
  const llmBody = {
    general_prompt: (await systemPrompt()).content,
    begin_message: settings.greeting,
  }
  const agentBody = {
    agent_name: `${settings.businessName} receptionist (hap-voice)`,
    webhook_url: status.eventsUrl,
    post_call_analysis_data: ANALYSIS_FIELDS,
    language: "en-US",
  }

  // Update in place when the agent already exists (keeps the voice and any
  // other dashboard tweaks); create from scratch otherwise.
  const existingId = settings.retellAgentId || config.retell.agentId
  if (existingId) {
    let agent: any = null
    try {
      agent = await retellApi("GET", `/get-agent/${encodeURIComponent(existingId)}`)
    } catch {
      // Agent was deleted on the Retell side — fall through and recreate.
    }
    if (agent) {
      const llmId = agent.response_engine?.type === "retell-llm" ? agent.response_engine.llm_id : null
      if (llmId) await retellApi("PATCH", `/update-retell-llm/${encodeURIComponent(llmId)}`, llmBody)
      await retellApi("PATCH", `/update-agent/${encodeURIComponent(existingId)}`, agentBody)
      await publishAgent(existingId)
      return { agentId: existingId, created: false }
    }
  }

  const llm = await retellApi("POST", "/create-retell-llm", llmBody)
  if (typeof llm?.llm_id !== "string") throw new Error("Retell create-retell-llm returned no llm_id")
  const agent = await retellApi("POST", "/create-agent", {
    response_engine: { type: "retell-llm", llm_id: llm.llm_id },
    voice_id: "11labs-Adrian", // pleasant default; change any time in the Retell dashboard
    ...agentBody,
  })
  if (typeof agent?.agent_id !== "string") throw new Error("Retell create-agent returned no agent_id")
  await updateSettings({ retellAgentId: agent.agent_id })
  await publishAgent(agent.agent_id)
  return { agentId: agent.agent_id, created: true }
}

// Best-effort: registered calls use the latest agent version, but publishing
// keeps dashboard test tools and version history tidy.
async function publishAgent(agentId: string): Promise<void> {
  try {
    const agent = await retellApi("GET", `/get-agent/${encodeURIComponent(agentId)}`)
    const version = typeof agent?.version === "number" ? agent.version : 0
    await retellApi("POST", `/publish-agent-version/${encodeURIComponent(agentId)}`, { version })
  } catch {
    // Non-fatal.
  }
}

// ─── Call handoff (dial-to-SIP mode) ─────────────────────────────────────────

// Register an inbound call with Retell so the Twilio webhook can hand it off
// with <Dial><Sip>. Retell expects the dial within 5 minutes of registration;
// ours follows in the same webhook response. The local call id rides along as
// metadata and comes back on every event webhook.
export async function registerRetellCall(input: {
  fromNumber: string
  toNumber: string | null
  localCallId: number
}): Promise<{ callId: string; sipUri: string }> {
  const agentId = await getRetellAgentId()
  if (!agentId) throw new Error("no Retell agent configured")
  const body: Record<string, unknown> = {
    agent_id: agentId,
    direction: "inbound",
    metadata: { local_call_id: input.localCallId, voice_provider: "retell" },
  }
  // Retell wants E.164 here; skip Twilio's "unknown"/anonymous callers.
  if (input.fromNumber.startsWith("+")) body.from_number = input.fromNumber
  if (input.toNumber?.startsWith("+")) body.to_number = input.toNumber

  const res = await fetch(`${config.retell.apiBase}/v2/register-phone-call`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${config.retell.apiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
    // Keep well under Twilio's 15s webhook timeout, leaving room for TwiML.
    signal: AbortSignal.timeout(5000),
  })
  if (!res.ok) throw new Error(`register-phone-call failed (HTTP ${res.status})`)
  const data = await res.json().catch(() => null)
  const callId = typeof data?.call_id === "string" && data.call_id ? data.call_id : null
  if (!callId) throw new Error("register-phone-call returned no call_id")
  return { callId, sipUri: `sip:${callId}@${config.retell.sipDomain}` }
}

// ─── Readiness (booleans only — never the secret values themselves) ─────────

export interface RetellStatus {
  apiKeyConfigured: boolean
  agentIdConfigured: boolean
  publicHostConfigured: boolean
  signatureValidation: boolean
  migrationReady: boolean
  ready: boolean
  inboundUrl: string | null
  eventsUrl: string | null
}

export async function getRetellStatus(): Promise<RetellStatus> {
  const host = config.publicHost.replace(/^https?:\/\//, "").replace(/\/+$/, "")

  let migrationReady = false
  try {
    migrationReady = !!(await queryOne(
      `SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'calls' AND column_name = 'retell_call_id'`,
    ))
  } catch {
    // DB unreachable — reported as not ready.
  }

  const apiKeyConfigured = !!config.retell.apiKey
  const agentIdConfigured = !!(await getRetellAgentId())
  const publicHostConfigured = !!host

  return {
    apiKeyConfigured,
    agentIdConfigured,
    publicHostConfigured,
    signatureValidation: !config.retell.skipValidation,
    migrationReady,
    ready: apiKeyConfigured && agentIdConfigured && publicHostConfigured && migrationReady,
    inboundUrl: host ? `https://${host}/api/retell/inbound` : null,
    eventsUrl: host ? `https://${host}/api/retell/events` : null,
  }
}
