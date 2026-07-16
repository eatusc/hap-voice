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
  voice_provider: string
  retell_call_id: string | null
  disconnection_reason: string | null
  recording_url: string | null
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

// Columns updateCall may touch. Guards the dynamic SET clause so a key that
// didn't come from our own code (e.g. anything derived from webhook data) can
// never reach the SQL.
const CALL_COLUMNS = new Set([
  "twilio_call_sid", "stream_sid", "from_number", "to_number", "direction",
  "status", "started_at", "ended_at", "duration_seconds",
  "caller_name", "caller_company", "caller_email", "reason", "callback_number",
  "message", "summary", "spam_score", "spam_reason", "is_spam",
  "voice_provider", "retell_call_id", "disconnection_reason", "recording_url",
])

export async function updateCall(id: number, patch: Partial<Call>): Promise<void> {
  const keys = Object.keys(patch)
  if (keys.length === 0) return
  for (const k of keys) {
    if (!CALL_COLUMNS.has(k)) throw new Error(`updateCall: unknown column "${k}"`)
  }
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

export async function getCallByRetellId(retellCallId: string): Promise<Call | null> {
  return queryOne<Call>(`SELECT * FROM calls WHERE retell_call_id = $1`, [retellCallId])
}

// Create (or fetch, on webhook retry) the local record for a Retell call. The
// partial unique index on retell_call_id makes concurrent duplicate webhook
// deliveries converge on one row; the no-op DO UPDATE lets RETURNING yield it.
export async function createRetellCall(input: {
  retellCallId?: string | null
  fromNumber: string
  toNumber?: string | null
  status?: string
}): Promise<Call> {
  const row = await queryOne<Call>(
    `INSERT INTO calls (retell_call_id, voice_provider, from_number, to_number, status)
     VALUES ($1, 'retell', $2, $3, $4)
     ON CONFLICT (retell_call_id) WHERE retell_call_id IS NOT NULL
       DO UPDATE SET retell_call_id = EXCLUDED.retell_call_id
     RETURNING *`,
    [input.retellCallId ?? null, input.fromNumber, input.toNumber ?? null, input.status ?? "in_progress"],
  )
  return row!
}

// Atomically replace a call's transcript. Retell resends the full transcript on
// every event (and retries deliveries), so replacing — not appending — is what
// keeps processing idempotent.
export async function replaceTurns(
  callId: number,
  turns: { role: "caller" | "assistant"; text: string }[],
): Promise<void> {
  const client = await pool.connect()
  try {
    await client.query("BEGIN")
    await client.query(`DELETE FROM transcript_turns WHERE call_id = $1`, [callId])
    for (let i = 0; i < turns.length; i++) {
      await client.query(
        `INSERT INTO transcript_turns (call_id, seq, role, text) VALUES ($1, $2, $3, $4)`,
        [callId, i + 1, turns[i].role, turns[i].text],
      )
    }
    await client.query("COMMIT")
  } catch (err) {
    await client.query("ROLLBACK")
    throw err
  } finally {
    client.release()
  }
}

export async function isBlocked(number: string): Promise<boolean> {
  const row = await queryOne(`SELECT 1 FROM blocked_numbers WHERE number = $1`, [number])
  return !!row
}

// ─── Data deletion (right-to-erasure) ───────────────────────────────────────

export async function deleteCall(id: number): Promise<boolean> {
  // transcript_turns rows cascade via their FK (ON DELETE CASCADE).
  const rows = await query<{ id: number }>(`DELETE FROM calls WHERE id = $1 RETURNING id`, [id])
  return rows.length > 0
}

export interface DeletionResult {
  calls: number
  messages: number
}

// Erase every stored trace of a phone number: its calls (transcripts, extracted
// name/email/message, spam notes — transcript_turns cascade) and its SMS/MMS
// (bodies and any detected OTP codes). Matches the number in either direction so
// a caller who also texted, or was texted, is fully cleared. This is where
// "delete my data" requests are serviced.
export async function deleteDataForNumber(number: string): Promise<DeletionResult> {
  const client = await pool.connect()
  try {
    await client.query("BEGIN")
    const calls = await client.query(
      `DELETE FROM calls WHERE from_number = $1 OR to_number = $1 OR callback_number = $1`,
      [number],
    )
    const messages = await client.query(
      `DELETE FROM messages WHERE from_number = $1 OR to_number = $1`,
      [number],
    )
    await client.query("COMMIT")
    return { calls: calls.rowCount ?? 0, messages: messages.rowCount ?? 0 }
  } catch (err) {
    await client.query("ROLLBACK")
    throw err
  } finally {
    client.release()
  }
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
