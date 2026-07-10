import { query, type BlockedNumber } from "@/lib/db"
import { BlockedManager } from "@/components/blocked-manager"

export const dynamic = "force-dynamic"

export default async function BlockedPage() {
  const blocked = await query<BlockedNumber>(
    `SELECT * FROM blocked_numbers ORDER BY created_at DESC`,
  )
  return (
    <div>
      <h1 className="text-lg font-semibold mb-1">Blocked numbers</h1>
      <p className="text-sm text-neutral-500 mb-5">
        Calls from these numbers are rejected immediately — the AI never picks up.
      </p>
      <BlockedManager initial={blocked} />
    </div>
  )
}
