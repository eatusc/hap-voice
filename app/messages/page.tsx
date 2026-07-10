import { listMessages } from "@/lib/db"
import { MessageFeed } from "@/components/message-feed"

export const dynamic = "force-dynamic"

export default async function MessagesPage() {
  const messages = await listMessages(200)
  return (
    <div>
      <h1 className="text-lg font-semibold mb-1">Texts</h1>
      <p className="text-sm text-neutral-500 mb-5">
        Inbound SMS/MMS to your business line. Verification codes are detected and made
        one-tap copyable.
      </p>
      <MessageFeed initial={messages} />
    </div>
  )
}
