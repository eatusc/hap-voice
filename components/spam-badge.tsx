export function SpamBadge({ score, isSpam }: { score: number | null; isSpam: boolean }) {
  if (score == null) return null
  const pct = Math.round(score * 100)
  if (isSpam) {
    return (
      <span className="inline-flex items-center rounded-full bg-red-500/15 text-red-300 border border-red-500/30 px-2 py-0.5 text-xs font-medium">
        Spam {pct}%
      </span>
    )
  }
  if (score >= 0.3) {
    return (
      <span className="inline-flex items-center rounded-full bg-amber-500/15 text-amber-300 border border-amber-500/30 px-2 py-0.5 text-xs font-medium">
        Suspicious {pct}%
      </span>
    )
  }
  return (
    <span className="inline-flex items-center rounded-full bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 px-2 py-0.5 text-xs font-medium">
      Legit
    </span>
  )
}
