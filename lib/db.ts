import { Pool } from "pg"
import { config } from "./config"

// Single shared pool. Next.js dev + the custom server share one module instance.
const g = globalThis as unknown as { __hapPool?: Pool }

export const pool =
  g.__hapPool ??
  new Pool({
    connectionString: config.databaseUrl,
    max: 10,
  })

if (process.env.NODE_ENV !== "production") g.__hapPool = pool

export async function query<T = any>(text: string, params: any[] = []): Promise<T[]> {
  const res = await pool.query(text, params)
  return res.rows as T[]
}

export async function queryOne<T = any>(text: string, params: any[] = []): Promise<T | null> {
  const rows = await query<T>(text, params)
  return rows[0] ?? null
}

// ─── Domain types ───────────────────────────────────────────────────────────

export interface Call {
  id: number
  twilio_call_sid: string | null
  stream_sid: string | null
  from_number: string
  to_number: string | null
  direction: string
  status: string
  started_at: string
  ended_at: string | null
  duration_seconds: number | null
  caller_name: string | null
  caller_company: string | null
  caller_email: string | null
  reason: string | null
  callback_number: string | null
  message: string | null
  summary: string | null
  spam_score: number | null
  spam_reason: string | null
  is_spam: boolean
  created_at: string
}

export interface TranscriptTurn {
  id: number
  call_id: number
  seq: number
  role: "caller" | "assistant"
  text: string
  ts: string
}

export interface BlockedNumber {
  id: number
  number: string
  reason: string | null
  created_at: string
}

export interface Message {
  id: number
  twilio_message_sid: string | null
  direction: "inbound" | "outbound"
  from_number: string
  to_number: string | null
  body: string
  num_media: number
  media_urls: string[] | null
  detected_code: string | null
  read_at: string | null
  received_at: string
  created_at: string
}

// ─── Call helpers ───────────────────────────────────────────────────────────

export async function createCall(input: {
  twilioCallSid?: string | null
  streamSid?: string | null
  fromNumber: string
  toNumber?: string | null
  status?: string
}): Promise<Call> {
  const row = await queryOne<Call>(
    `INSERT INTO calls (twilio_call_sid, stream_sid, from_number, to_number, status)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (twilio_call_sid) DO UPDATE SET stream_sid = EXCLUDED.stream_sid
     RETURNING *`,
    [
      input.twilioCallSid ?? null,
      input.streamSid ?? null,
      input.fromNumber,
      input.toNumber ?? null,
      input.status ?? "in_progress",
    ],
  )
  return row!
}

export async function updateCall(id: number, patch: Partial<Call>): Promise<void> {
  const keys = Object.keys(patch)
  if (keys.length === 0) return
  const sets = keys.map((k, i) => `${k} = $${i + 2}`).join(", ")
  await query(`UPDATE calls SET ${sets} WHERE id = $1`, [id, ...keys.map((k) => (patch as any)[k])])
}

export async function addTurn(callId: number, role: "caller" | "assistant", text: string): Promise<void> {
  await query(
    `INSERT INTO transcript_turns (call_id, seq, role, text)
     VALUES ($1, (SELECT COALESCE(MAX(seq), 0) + 1 FROM transcript_turns WHERE call_id = $1), $2, $3)`,
    [callId, role, text],
  )
}

export async function getTurns(callId: number): Promise<TranscriptTurn[]> {
  return query<TranscriptTurn>(
    `SELECT * FROM transcript_turns WHERE call_id = $1 ORDER BY seq ASC`,
    [callId],
  )
}

export async function isBlocked(number: string): Promise<boolean> {
  const row = await queryOne(`SELECT 1 FROM blocked_numbers WHERE number = $1`, [number])
  return !!row
}

// ─── Message helpers ────────────────────────────────────────────────────────

export async function insertMessage(input: {
  twilioMessageSid?: string | null
  direction?: "inbound" | "outbound"
  fromNumber: string
  toNumber?: string | null
  body: string
  numMedia?: number
  mediaUrls?: string[] | null
  detectedCode?: string | null
}): Promise<Message | null> {
  return queryOne<Message>(
    `INSERT INTO messages
       (twilio_message_sid, direction, from_number, to_number, body, num_media, media_urls, detected_code)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     ON CONFLICT (twilio_message_sid) DO NOTHING
     RETURNING *`,
    [
      input.twilioMessageSid ?? null,
      input.direction ?? "inbound",
      input.fromNumber,
      input.toNumber ?? null,
      input.body,
      input.numMedia ?? 0,
      input.mediaUrls ? JSON.stringify(input.mediaUrls) : null,
      input.detectedCode ?? null,
    ],
  )
}

export async function listMessages(limit = 200): Promise<Message[]> {
  return query<Message>(`SELECT * FROM messages ORDER BY received_at DESC LIMIT $1`, [limit])
}

export async function countUnreadMessages(): Promise<number> {
  const row = await queryOne<{ n: string }>(
    `SELECT COUNT(*)::text AS n FROM messages WHERE direction = 'inbound' AND read_at IS NULL`,
  )
  return row ? parseInt(row.n, 10) : 0
}

export async function markAllMessagesRead(): Promise<void> {
  await query(`UPDATE messages SET read_at = now() WHERE read_at IS NULL AND direction = 'inbound'`)
}

// ─── Analytics ──────────────────────────────────────────────────────────────

export interface Analytics {
  totalCalls: number
  callsLast7: number
  spamCount: number
  avgDurationSeconds: number | null
  totalMessages: number
  perDay: { day: string; count: number }[]
}

export async function getAnalytics(): Promise<Analytics> {
  const totals = await queryOne<{
    total_calls: string
    calls_last7: string
    spam_count: string
    avg_duration: string | null
    total_messages: string
  }>(
    `SELECT
       (SELECT COUNT(*) FROM calls)::text AS total_calls,
       (SELECT COUNT(*) FROM calls WHERE started_at >= now() - interval '7 days')::text AS calls_last7,
       (SELECT COUNT(*) FROM calls WHERE is_spam)::text AS spam_count,
       (SELECT ROUND(AVG(duration_seconds)) FROM calls WHERE duration_seconds IS NOT NULL)::text AS avg_duration,
       (SELECT COUNT(*) FROM messages)::text AS total_messages`,
  )

  // Calls per day for the last 14 days (zero-filled), oldest → newest.
  const rows = await query<{ day: string; count: string }>(
    `SELECT to_char(d.day, 'YYYY-MM-DD') AS day, COUNT(c.id)::text AS count
       FROM generate_series(
              (now() - interval '13 days')::date, now()::date, interval '1 day'
            ) AS d(day)
       LEFT JOIN calls c ON c.started_at::date = d.day
      GROUP BY d.day
      ORDER BY d.day ASC`,
  )

  return {
    totalCalls: parseInt(totals?.total_calls ?? "0", 10),
    callsLast7: parseInt(totals?.calls_last7 ?? "0", 10),
    spamCount: parseInt(totals?.spam_count ?? "0", 10),
    avgDurationSeconds: totals?.avg_duration ? parseInt(totals.avg_duration, 10) : null,
    totalMessages: parseInt(totals?.total_messages ?? "0", 10),
    perDay: rows.map((r) => ({ day: r.day, count: parseInt(r.count, 10) })),
  }
}
