import Link from "next/link"
import { notFound } from "next/navigation"
import { getTurns, isBlocked, queryOne, type Call } from "@/lib/db"
import { formatPhone, formatDuration, formatDateTime } from "@/lib/format"
import { SpamBadge } from "@/components/spam-badge"
import { SpamControl } from "@/components/spam-control"
import { BlockButton } from "@/components/block-button"

export const dynamic = "force-dynamic"

export default async function CallDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const call = await queryOne<Call>(`SELECT * FROM calls WHERE id = $1`, [Number(id)])
  if (!call) notFound()

  const [turns, blocked] = await Promise.all([getTurns(call.id), isBlocked(call.from_number)])

  return (
    <div>
      <Link href="/" className="text-sm text-neutral-400 hover:text-white">
        ← Back to calls
      </Link>

      <div className="mt-3 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold">
            {call.caller_name || formatPhone(call.from_number)}
          </h1>
          <div className="text-neutral-400 text-sm mt-0.5">
            {call.caller_company ? `${call.caller_company} · ` : ""}
            {formatPhone(call.from_number)} · {formatDateTime(call.started_at)} ·{" "}
            {formatDuration(call.duration_seconds)}
          </div>
        </div>
        <div className="flex items-center gap-3">
          <SpamBadge score={call.spam_score} isSpam={call.is_spam} />
          <SpamControl callId={call.id} isSpam={call.is_spam} />
          <BlockButton number={call.from_number} reason={call.spam_reason} blocked={blocked} />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-6">
        {/* Extracted details */}
        <div className="md:col-span-1 space-y-4">
          <Panel title="Details">
            <Field label="Name" value={call.caller_name} />
            <Field label="Company" value={call.caller_company} />
            <Field label="Callback" value={formatPhone(call.callback_number)} />
            <Field label="Reason" value={call.reason} />
          </Panel>

          {call.message && (
            <Panel title="Message">
              <p className="text-sm text-neutral-200 whitespace-pre-wrap">{call.message}</p>
            </Panel>
          )}

          {call.spam_reason && (
            <Panel title="Spam assessment">
              <p className="text-sm text-neutral-300">{call.spam_reason}</p>
              {call.spam_score != null && (
                <p className="text-xs text-neutral-500 mt-1">
                  Score: {Math.round(call.spam_score * 100)}%
                </p>
              )}
            </Panel>
          )}
        </div>

        {/* Transcript */}
        <div className="md:col-span-2">
          <Panel title="Transcript">
            {turns.length === 0 ? (
              <p className="text-sm text-neutral-500">No transcript captured.</p>
            ) : (
              <div className="space-y-3">
                {turns.map((t) => (
                  <div
                    key={t.id}
                    className={t.role === "assistant" ? "flex justify-start" : "flex justify-end"}
                  >
                    <div
                      className={
                        t.role === "assistant"
                          ? "max-w-[80%] rounded-2xl rounded-tl-sm bg-neutral-800 px-3.5 py-2 text-sm"
                          : "max-w-[80%] rounded-2xl rounded-tr-sm bg-emerald-500/15 border border-emerald-500/20 px-3.5 py-2 text-sm"
                      }
                    >
                      <div className="text-[10px] uppercase tracking-wide text-neutral-500 mb-0.5">
                        {t.role === "assistant" ? "Assistant" : "Caller"}
                      </div>
                      {t.text}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Panel>
        </div>
      </div>
    </div>
  )
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-neutral-800 bg-neutral-900/40">
      <div className="px-4 py-2.5 border-b border-neutral-800 text-xs uppercase tracking-wide text-neutral-400">
        {title}
      </div>
      <div className="p-4">{children}</div>
    </section>
  )
}

function Field({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="flex justify-between gap-4 py-1 text-sm">
      <span className="text-neutral-500">{label}</span>
      <span className="text-neutral-200 text-right">{value || "—"}</span>
    </div>
  )
}
