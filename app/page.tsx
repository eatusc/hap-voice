import Link from "next/link"
import { query, type Call } from "@/lib/db"
import { formatPhone, formatDuration, relativeTime } from "@/lib/format"
import { SpamBadge } from "@/components/spam-badge"

export const dynamic = "force-dynamic"

export default async function CallsPage({
  searchParams,
}: {
  searchParams: Promise<{ spam?: string; q?: string }>
}) {
  const { spam, q } = await searchParams
  const spamOnly = spam === "1"

  const where: string[] = []
  const params: any[] = []
  if (spamOnly) where.push("is_spam = true")
  if (q?.trim()) {
    params.push(`%${q.trim()}%`)
    where.push(
      `(from_number ILIKE $${params.length} OR caller_name ILIKE $${params.length} OR caller_company ILIKE $${params.length})`,
    )
  }
  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : ""
  const calls = await query<Call>(
    `SELECT * FROM calls ${whereSql} ORDER BY started_at DESC LIMIT 200`,
    params,
  )

  return (
    <div>
      <div className="flex items-center justify-between mb-5">
        <h1 className="text-lg font-semibold">
          {spamOnly ? "Potential spam" : "Recent calls"}
          <span className="ml-2 text-neutral-500 text-sm font-normal">{calls.length}</span>
        </h1>
        <form className="flex gap-2" action="/">
          <input
            name="q"
            defaultValue={q ?? ""}
            placeholder="Search number, name, company…"
            className="bg-neutral-900 border border-neutral-800 rounded-lg px-3 py-1.5 text-sm w-64 focus:outline-none focus:border-neutral-600"
          />
        </form>
      </div>

      {calls.length === 0 ? (
        <EmptyState spamOnly={spamOnly} />
      ) : (
        <div className="rounded-xl border border-neutral-800 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-neutral-900 text-neutral-400 text-xs uppercase tracking-wide">
              <tr>
                <th className="text-left font-medium px-4 py-2.5">Caller</th>
                <th className="text-left font-medium px-4 py-2.5">Summary</th>
                <th className="text-left font-medium px-4 py-2.5">Status</th>
                <th className="text-right font-medium px-4 py-2.5">Length</th>
                <th className="text-right font-medium px-4 py-2.5">When</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-800">
              {calls.map((c) => (
                <tr key={c.id} className="hover:bg-neutral-900/60 transition-colors">
                  <td className="px-4 py-3">
                    <Link href={`/calls/${c.id}`} className="block">
                      <div className="font-medium">{c.caller_name || formatPhone(c.from_number)}</div>
                      <div className="text-neutral-500 text-xs">
                        {c.caller_company ? `${c.caller_company} · ` : ""}
                        {formatPhone(c.from_number)}
                      </div>
                    </Link>
                  </td>
                  <td className="px-4 py-3 max-w-sm">
                    <Link href={`/calls/${c.id}`} className="block text-neutral-300 truncate">
                      {c.summary || c.reason || <span className="text-neutral-600">—</span>}
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    {c.status === "rejected_blocked" ? (
                      <span className="text-neutral-500 text-xs">Blocked</span>
                    ) : (
                      <SpamBadge score={c.spam_score} isSpam={c.is_spam} />
                    )}
                  </td>
                  <td className="px-4 py-3 text-right text-neutral-400">
                    {formatDuration(c.duration_seconds)}
                  </td>
                  <td className="px-4 py-3 text-right text-neutral-400 whitespace-nowrap">
                    {relativeTime(c.started_at)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function EmptyState({ spamOnly }: { spamOnly: boolean }) {
  return (
    <div className="rounded-xl border border-dashed border-neutral-800 py-16 text-center text-neutral-500">
      {spamOnly ? (
        <p>No calls flagged as spam yet.</p>
      ) : (
        <>
          <p className="mb-1">No calls yet.</p>
          <p className="text-sm">
            Run <code className="text-neutral-300">npm run db:seed</code> for demo data, or{" "}
            <code className="text-neutral-300">npx tsx scripts/simulate-call.ts &lt;wav&gt;</code> to
            test the pipeline.
          </p>
        </>
      )}
    </div>
  )
}
