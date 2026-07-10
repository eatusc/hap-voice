import type { Analytics } from "@/lib/db"
import { formatDuration } from "@/lib/format"

// Compact analytics header shown above the call list. Pure server component —
// stat tiles plus a zero-filled 14-day call-volume bar chart (no chart lib).
export function AnalyticsOverview({ data }: { data: Analytics }) {
  const spamRate = data.totalCalls > 0 ? Math.round((data.spamCount / data.totalCalls) * 100) : 0
  const max = Math.max(1, ...data.perDay.map((d) => d.count))

  const stats = [
    { label: "Total calls", value: String(data.totalCalls) },
    { label: "Last 7 days", value: String(data.callsLast7) },
    { label: "Avg length", value: formatDuration(data.avgDurationSeconds) },
    { label: "Spam", value: `${spamRate}%`, sub: `${data.spamCount} flagged` },
    { label: "Texts", value: String(data.totalMessages) },
  ]

  return (
    <div className="mb-6 rounded-xl border border-neutral-800 bg-neutral-900/40 p-4">
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-4">
        {stats.map((s) => (
          <div key={s.label} className="rounded-lg bg-neutral-900 border border-neutral-800 px-3 py-2.5">
            <div className="text-neutral-500 text-[11px] uppercase tracking-wide">{s.label}</div>
            <div className="text-xl font-semibold tabular-nums">{s.value}</div>
            {s.sub && <div className="text-neutral-600 text-[11px]">{s.sub}</div>}
          </div>
        ))}
      </div>

      <div className="text-neutral-500 text-[11px] uppercase tracking-wide mb-2">
        Call volume · last 14 days
      </div>
      <div className="flex items-end gap-1 h-20">
        {data.perDay.map((d) => (
          <div key={d.day} className="flex-1 flex flex-col items-center justify-end group">
            <div
              className="w-full rounded-sm bg-emerald-500/70 group-hover:bg-emerald-400 transition-colors min-h-[2px]"
              style={{ height: `${(d.count / max) * 100}%` }}
              title={`${d.day}: ${d.count} call${d.count === 1 ? "" : "s"}`}
            />
          </div>
        ))}
      </div>
      <div className="flex justify-between text-neutral-600 text-[10px] mt-1">
        <span>{data.perDay[0]?.day.slice(5)}</span>
        <span>{data.perDay[data.perDay.length - 1]?.day.slice(5)}</span>
      </div>
    </div>
  )
}
