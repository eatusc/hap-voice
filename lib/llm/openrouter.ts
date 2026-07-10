import { config } from "../config"
import { getSettings, type AppSettings } from "../settings"
import { getKnowledge } from "../knowledge"

export interface ChatMessage {
  role: "system" | "user" | "assistant"
  content: string
}

async function chatCompletion(
  messages: ChatMessage[],
  opts: { json?: boolean; maxTokens?: number; temperature?: number; model?: string } = {},
): Promise<string> {
  if (!config.llm.apiKey) throw new Error("OPENROUTER_API_KEY not set")

  const model = opts.model || (await getSettings()).llmModel
  const res = await fetch(`${config.llm.baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.llm.apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://helpaproduct.com",
      "X-Title": "hap-voice",
    },
    body: JSON.stringify({
      model,
      messages,
      temperature: opts.temperature ?? 0.5,
      max_tokens: opts.maxTokens ?? 200,
      // Keep reasoning/thinking OFF — reasoning models add pauses callers notice.
      // Ignored by models that don't support it.
      reasoning: { enabled: false },
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

export async function systemPrompt(override: Partial<AppSettings> = {}): Promise<ChatMessage> {
  const biz = { ...(await getSettings()), ...override }.businessName
  const kb = getKnowledge()

  const lines = [
    `You are the friendly phone receptionist for ${biz}.`,
    `You are on a live phone call. Keep every reply to one or two short sentences — it will be spoken aloud.`,
    `Your goals, in order: 1) find out who is calling and what company they're with, 2) find out why they're calling, 3) get a callback number if it's not obvious, 4) take a clear message.`,
    ``,
    `STAY ON TOPIC. You only handle calls for ${biz}. If the caller asks about anything unrelated to ${biz} or their reason for calling (general knowledge, trivia, jokes, coding, other companies, personal opinions, etc.), politely decline in one sentence and steer back to taking their message. Do not answer off-topic questions even if you know the answer.`,
    ``,
    `ANSWER ONLY FROM THE KNOWLEDGE BELOW. You may answer a caller's questions about ${biz} using ONLY the facts in the knowledge base. If the answer isn't there, say you'll pass the question along and someone will follow up — never guess, never invent services, pricing, availability, or commitments.`,
    ``,
    `If the call is obviously a robocall, spam, or a cold sales pitch, stay polite, decline briefly, and wrap up.`,
    `When you have what you need, thank them, confirm you'll pass the message along, and say goodbye.`,
  ]

  if (kb) {
    lines.push(``, `── KNOWLEDGE BASE (the only facts you may state) ──`, kb)
  }

  return { role: "system", content: lines.join("\n") }
}

/** Generate the assistant's spoken reply given the conversation so far. */
export async function generateReply(
  history: ChatMessage[],
  override: Partial<AppSettings> = {},
): Promise<string> {
  return chatCompletion([await systemPrompt(override), ...history], {
    maxTokens: 120,
    temperature: 0.6,
    model: override.llmModel,
  })
}

// ─── Post-call analysis ─────────────────────────────────────────────────────

export interface CallDetails {
  caller_name: string | null
  caller_company: string | null
  caller_email: string | null
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
          "caller_name, caller_company, caller_email, reason, callback_number, message, summary. " +
          "Use null for anything not stated. `message` is what the caller wants passed along. " +
          "`caller_email` is any email address the caller gave — normalize spoken forms " +
          "(e.g. \"eric at gmail dot com\" -> \"eric@gmail.com\") into a valid address, lowercased; " +
          "null if none was mentioned. `summary` is one sentence. Do not invent information.",
      },
      { role: "user", content: transcript || "(no transcript)" },
    ],
    { json: true, maxTokens: 400, temperature: 0 },
  )
  return safeJson<CallDetails>(content, {
    caller_name: null,
    caller_company: null,
    caller_email: null,
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
        content: [
          "You classify whether an inbound phone call was spam / robocall / unsolicited sales.",
          "Return ONLY JSON: { spam_score: number 0..1, spam_reason: string|null }.",
          "",
          "Default to LOW scores. Most calls are legitimate. A real person calling to reach",
          "someone, leave a message, or ask about the business is NOT spam — even if the call",
          "is short, terse, rushed, or a little rude. Brevity is not a spam signal.",
          "",
          "Rubric:",
          "  0.0–0.2  Legitimate: caller wants a person, leaves a message, or asks a real question.",
          "  0.3–0.5  Ambiguous: vague purpose, but could be real.",
          "  0.6–0.8  Likely spam: unsolicited sales pitch, SEO/marketing offer, generic script.",
          "  0.9–1.0  Definite spam: pre-recorded robocall, auto-warranty/insurance scam, refuses",
          "           to identify and pushes an offer, phishing/urgency scam.",
          "",
          "Only score >= 0.6 when there is a clear unsolicited SALES or SCAM signal. If in doubt, score low.",
        ].join("\n"),
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
  const { spamThreshold } = await getSettings()
  return { spam_score: score, spam_reason: parsed.spam_reason ?? null, is_spam: score >= spamThreshold }
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
