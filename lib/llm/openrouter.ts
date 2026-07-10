import { config } from "../config"

export interface ChatMessage {
  role: "system" | "user" | "assistant"
  content: string
}

async function chatCompletion(
  messages: ChatMessage[],
  opts: { json?: boolean; maxTokens?: number; temperature?: number } = {},
): Promise<string> {
  if (!config.llm.apiKey) throw new Error("OPENROUTER_API_KEY not set")

  const res = await fetch(`${config.llm.baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.llm.apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://helpaproduct.com",
      "X-Title": "hap-voice",
    },
    body: JSON.stringify({
      model: config.llm.model,
      messages,
      temperature: opts.temperature ?? 0.5,
      max_tokens: opts.maxTokens ?? 200,
      ...(opts.json ? { response_format: { type: "json_object" } } : {}),
    }),
  })

  if (!res.ok) {
    throw new Error(`OpenRouter ${res.status}: ${(await res.text()).slice(0, 300)}`)
  }

  const data = await res.json()
  return data.choices?.[0]?.message?.content?.trim() ?? ""
}

// ─── Live conversation ──────────────────────────────────────────────────────

export function systemPrompt(): ChatMessage {
  const biz = config.persona.businessName
  return {
    role: "system",
    content: [
      `You are the friendly phone receptionist for ${biz}, a product consulting business.`,
      `You are on a live phone call. Keep every reply to one or two short sentences — it will be spoken aloud.`,
      `Your goals, in order: 1) find out who is calling and what company they're with, 2) find out why they're calling, 3) get a callback number if it's not obvious, 4) take a clear message.`,
      `Be warm and natural. Never invent details about ${biz}'s services, pricing, or availability — if asked something specific, say you'll pass it along and someone will follow up.`,
      `If the call is obviously a robocall, spam, or a sales pitch, stay polite, decline briefly, and wrap up.`,
      `When you have what you need, thank them, confirm you'll pass the message along, and say goodbye.`,
    ].join(" "),
  }
}

/** Generate the assistant's spoken reply given the conversation so far. */
export async function generateReply(history: ChatMessage[]): Promise<string> {
  return chatCompletion([systemPrompt(), ...history], { maxTokens: 120, temperature: 0.6 })
}

// ─── Post-call analysis ─────────────────────────────────────────────────────

export interface CallDetails {
  caller_name: string | null
  caller_company: string | null
  reason: string | null
  callback_number: string | null
  message: string | null
  summary: string | null
}

export async function extractCallDetails(transcript: string): Promise<CallDetails> {
  const content = await chatCompletion(
    [
      {
        role: "system",
        content:
          "Extract structured details from this phone call transcript. Return ONLY JSON with keys: " +
          "caller_name, caller_company, reason, callback_number, message, summary. " +
          "Use null for anything not stated. `message` is what the caller wants passed along. " +
          "`summary` is one sentence. Do not invent information.",
      },
      { role: "user", content: transcript || "(no transcript)" },
    ],
    { json: true, maxTokens: 400, temperature: 0 },
  )
  return safeJson<CallDetails>(content, {
    caller_name: null,
    caller_company: null,
    reason: null,
    callback_number: null,
    message: null,
    summary: null,
  })
}

export interface SpamAssessment {
  spam_score: number
  spam_reason: string | null
  is_spam: boolean
}

export async function scoreSpam(transcript: string, fromNumber: string): Promise<SpamAssessment> {
  const content = await chatCompletion(
    [
      {
        role: "system",
        content:
          "You classify whether a phone call was spam / robocall / unsolicited sales. " +
          "Return ONLY JSON: { spam_score: number 0..1, spam_reason: string|null }. " +
          "1 = definitely spam, 0 = clearly a legitimate personal/business call. " +
          "Signals of spam: pre-recorded feel, generic sales pitch, warranty/insurance/SEO offers, refusal to identify, urgency scams.",
      },
      { role: "user", content: `From: ${fromNumber}\n\nTranscript:\n${transcript || "(no transcript)"}` },
    ],
    { json: true, maxTokens: 200, temperature: 0 },
  )
  const parsed = safeJson<{ spam_score: number; spam_reason: string | null }>(content, {
    spam_score: 0,
    spam_reason: null,
  })
  const score = Math.max(0, Math.min(1, Number(parsed.spam_score) || 0))
  return { spam_score: score, spam_reason: parsed.spam_reason ?? null, is_spam: score >= 0.6 }
}

function safeJson<T>(raw: string, fallback: T): T {
  try {
    // Strip code fences if a model wrapped the JSON.
    const cleaned = raw.replace(/^```(?:json)?/i, "").replace(/```$/, "").trim()
    return { ...fallback, ...JSON.parse(cleaned) }
  } catch {
    return fallback
  }
}
