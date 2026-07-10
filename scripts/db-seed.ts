// Inserts a few demo calls so the dashboard is populated without a live phone.
import "../lib/load-env" // must be first — populates process.env before config is read
import { pool, createCall, addTurn, updateCall } from "../lib/db"

interface SeedCall {
  from: string
  minutesAgo: number
  duration: number
  name: string | null
  company: string | null
  reason: string | null
  callback: string | null
  message: string | null
  summary: string | null
  spam: number
  spamReason: string | null
  turns: Array<["caller" | "assistant", string]>
}

const seeds: SeedCall[] = [
  {
    from: "+14155559021",
    minutesAgo: 12,
    duration: 74,
    name: "Dana Whitfield",
    company: "Northwind Labs",
    reason: "Wants help with product positioning for a new B2B tool",
    callback: "+14155559021",
    message:
      "Dana from Northwind Labs is looking for a positioning consult for their new B2B analytics product. Wants a callback this week.",
    summary: "Northwind Labs wants a product positioning consult; callback this week.",
    spam: 0.02,
    spamReason: null,
    turns: [
      ["assistant", "Thanks for calling HelpAProduct. This is the assistant — who am I speaking with?"],
      ["caller", "Hi, this is Dana from Northwind Labs."],
      ["assistant", "Great to meet you, Dana. What can we help you with today?"],
      ["caller", "We're launching a new B2B analytics product and need help with positioning."],
      ["assistant", "Got it. What's the best number to reach you, and when works?"],
      ["caller", "This number is fine, sometime this week."],
      ["assistant", "Perfect — I'll pass this along and someone will follow up this week. Thanks, Dana!"],
    ],
  },
  {
    from: "+18005559999",
    minutesAgo: 48,
    duration: 22,
    name: null,
    company: null,
    reason: "Auto warranty robocall",
    callback: null,
    message: null,
    summary: "Pre-recorded auto warranty spam call.",
    spam: 0.96,
    spamReason: "Pre-recorded auto warranty pitch, refused to identify, generic urgency script.",
    turns: [
      ["assistant", "Thanks for calling HelpAProduct. This is the assistant — who am I speaking with?"],
      ["caller", "This is a final notice regarding your vehicle's extended warranty."],
      ["assistant", "This sounds like a sales call — we're not interested. Have a good day."],
    ],
  },
  {
    from: "+16465550110",
    minutesAgo: 200,
    duration: 51,
    name: "Marcus Lee",
    company: null,
    reason: "Following up on a proposal",
    callback: "+16465550110",
    message: "Marcus is following up on the proposal sent last week and would like to schedule a call.",
    summary: "Marcus Lee following up on last week's proposal; wants to schedule a call.",
    spam: 0.05,
    spamReason: null,
    turns: [
      ["assistant", "Thanks for calling HelpAProduct. This is the assistant — who am I speaking with?"],
      ["caller", "Hey, it's Marcus. I'm following up on the proposal from last week."],
      ["assistant", "Thanks Marcus — I'll let the team know you called. What's the best callback number?"],
      ["caller", "The number I'm calling from is good."],
      ["assistant", "Will do. Someone will get back to you soon. Thanks!"],
    ],
  },
]

async function main() {
  for (const s of seeds) {
    const startedAt = new Date(Date.now() - s.minutesAgo * 60000)
    const call = await createCall({ fromNumber: s.from, status: "completed" })
    for (const [role, text] of s.turns) await addTurn(call.id, role, text)
    await updateCall(call.id, {
      started_at: startedAt.toISOString(),
      ended_at: new Date(startedAt.getTime() + s.duration * 1000).toISOString(),
      duration_seconds: s.duration,
      caller_name: s.name,
      caller_company: s.company,
      reason: s.reason,
      callback_number: s.callback,
      message: s.message,
      summary: s.summary,
      spam_score: s.spam,
      spam_reason: s.spamReason,
      is_spam: s.spam >= 0.6,
    })
    console.log(`Seeded call from ${s.from} (id ${call.id})`)
  }
  await pool.end()
  console.log("Done. ✔")
}

main().catch((err) => {
  console.error("db:seed failed:", err.message)
  process.exit(1)
})
