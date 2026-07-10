export const dynamic = "force-dynamic"

// A visual, plain-language explainer of how hap-voice handles a call — meant to
// be walked through with non-technical people. Intentionally light on jargon.

type Tag = "local" | "paid" | "free"

const TAG_STYLE: Record<Tag, string> = {
  local: "bg-sky-500/15 text-sky-300 border-sky-500/30",
  paid: "bg-amber-500/15 text-amber-300 border-amber-500/30",
  free: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
}

function Chip({ children, tag }: { children: React.ReactNode; tag?: Tag }) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] ${
        tag ? TAG_STYLE[tag] : "border-neutral-700 bg-neutral-800 text-neutral-300"
      }`}
    >
      {children}
    </span>
  )
}

// Compact "at a glance" pipeline shown up top.
const GLANCE = [
  { icon: "📞", label: "Call comes in" },
  { icon: "👂", label: "Hear & transcribe" },
  { icon: "🧠", label: "Understand & reply" },
  { icon: "🗣️", label: "Speak back" },
  { icon: "📇", label: "Log to dashboard" },
]

// The full call journey.
const STEPS: {
  icon: string
  title: string
  body: string
  chips: { label: string; tag?: Tag }[]
}[] = [
  {
    icon: "📞",
    title: "A call comes in",
    body: "Someone dials your business number. Your phone provider picks up and hands the call to your system.",
    chips: [{ label: "Twilio · phone number", tag: "paid" }],
  },
  {
    icon: "🔒",
    title: "Securely routed to your Mac",
    body: "The call is passed through a secure tunnel to the app running on your own Mac Studio — no server to rent, your data stays on your hardware.",
    chips: [{ label: "Cloudflare Tunnel", tag: "free" }, { label: "runs on your Mac", tag: "local" }],
  },
  {
    icon: "👂",
    title: "It listens",
    body: "As the caller speaks, their words are turned into text — right on the Mac, nothing sent to the cloud for this part.",
    chips: [{ label: "Whisper · speech-to-text", tag: "local" }],
  },
  {
    icon: "🧠",
    title: "It understands and decides what to say",
    body: "The assistant works out a helpful reply — but only using the facts in your Knowledge Base. If it doesn't know, it takes a message instead of guessing.",
    chips: [{ label: "GPT-4o-mini (via OpenRouter)", tag: "paid" }, { label: "your Knowledge Base" }],
  },
  {
    icon: "🗣️",
    title: "It speaks back",
    body: "The reply is spoken aloud in a natural voice, and sent back down the line to the caller.",
    chips: [{ label: "ElevenLabs voice", tag: "paid" }, { label: "or Kokoro (free)", tag: "free" }],
  },
  {
    icon: "🔁",
    title: "Back-and-forth, in real time",
    body: "Listening, understanding, and speaking repeat throughout the call — and the caller can interrupt naturally, just like talking to a person.",
    chips: [{ label: "live conversation" }],
  },
  {
    icon: "📝",
    title: "It wraps up the call",
    body: "When the call ends, the system reads the whole conversation and pulls out the important bits — who called, their company, why, a callback number, an email if mentioned — and scores whether it looked like spam.",
    chips: [{ label: "GPT-4o-mini extraction", tag: "paid" }],
  },
  {
    icon: "📇",
    title: "It lands in your dashboard",
    body: "The call, full transcript, and extracted details are saved and searchable — with texts, spam flags, and blocked numbers all in one place.",
    chips: [{ label: "PostgreSQL · your database", tag: "local" }],
  },
]

const SERVICES: {
  icon: string
  name: string
  role: string
  tag: Tag
  tagLabel: string
}[] = [
  { icon: "☎️", name: "Twilio", role: "The phone line — receives calls and texts on your number.", tag: "paid", tagLabel: "Paid per use" },
  { icon: "🔒", name: "Cloudflare Tunnel", role: "A secure public doorway to the app on your Mac.", tag: "free", tagLabel: "Free" },
  { icon: "👂", name: "Whisper", role: "Turns the caller's speech into text, on-device.", tag: "local", tagLabel: "Local · free" },
  { icon: "🧠", name: "GPT-4o-mini (OpenRouter)", role: "The brain — understands the caller and writes replies.", tag: "paid", tagLabel: "Paid · tiny cost" },
  { icon: "🗣️", name: "ElevenLabs / Kokoro", role: "The voice. ElevenLabs is premium; Kokoro is free & local.", tag: "paid", tagLabel: "Premium / free" },
  { icon: "🗄️", name: "PostgreSQL", role: "The memory — stores every call, transcript, and text.", tag: "local", tagLabel: "Local · free" },
  { icon: "📚", name: "Knowledge Base", role: "The only facts the assistant is allowed to say. You control it.", tag: "free", tagLabel: "You edit it" },
  { icon: "🖥️", name: "Mac Studio", role: "The whole system runs on your own machine, always on.", tag: "local", tagLabel: "Your hardware" },
]

const HIGHLIGHTS = [
  { icon: "🎯", title: "Never makes things up", body: "It answers only from your Knowledge Base and takes a message for anything else." },
  { icon: "🛡️", title: "Screens spam", body: "Every call is scored, and robocalls/sales pitches are flagged automatically." },
  { icon: "💬", title: "Feels human", body: "Real-time conversation with natural interruption — not a rigid phone tree." },
  { icon: "🔐", title: "Private by default", body: "Transcription and your database live on your own Mac, not a third party." },
]

export default function DocsPage() {
  return (
    <div className="space-y-10">
      {/* Intro */}
      <div>
        <h1 className="text-2xl font-semibold">How it works</h1>
        <p className="text-neutral-400 mt-2 max-w-2xl">
          Your AI receptionist answers calls and texts, has a real conversation, takes a message,
          and flags spam — then logs everything to this dashboard. Here's the journey of every call,
          and the pieces that make it happen.
        </p>
      </div>

      {/* At a glance pipeline */}
      <div className="rounded-2xl border border-neutral-800 bg-neutral-900/40 p-5">
        <div className="text-neutral-500 text-[11px] uppercase tracking-wide mb-4">At a glance</div>
        <div className="flex flex-wrap items-stretch gap-2">
          {GLANCE.map((g, i) => (
            <div key={g.label} className="flex items-center gap-2">
              <div className="flex flex-col items-center justify-center rounded-xl border border-neutral-800 bg-neutral-900 px-4 py-3 min-w-[120px] text-center">
                <span className="text-2xl">{g.icon}</span>
                <span className="text-xs text-neutral-300 mt-1.5">{g.label}</span>
              </div>
              {i < GLANCE.length - 1 && <span className="text-emerald-500 text-lg">→</span>}
            </div>
          ))}
        </div>
      </div>

      {/* The call journey — vertical stepper */}
      <div>
        <h2 className="text-lg font-semibold mb-5">The journey of a call</h2>
        <ol className="relative border-l border-neutral-800 ml-3 space-y-6">
          {STEPS.map((s, i) => (
            <li key={s.title} className="relative pl-8">
              <span className="absolute -left-[13px] top-0 flex h-6 w-6 items-center justify-center rounded-full bg-emerald-500 text-neutral-950 text-xs font-bold ring-4 ring-neutral-950">
                {i + 1}
              </span>
              <div className="rounded-xl border border-neutral-800 bg-neutral-900/40 p-4">
                <div className="flex items-center gap-2 mb-1.5">
                  <span className="text-xl">{s.icon}</span>
                  <h3 className="font-medium">{s.title}</h3>
                </div>
                <p className="text-sm text-neutral-300">{s.body}</p>
                <div className="flex flex-wrap gap-1.5 mt-3">
                  {s.chips.map((c) => (
                    <Chip key={c.label} tag={c.tag}>
                      {c.label}
                    </Chip>
                  ))}
                </div>
              </div>
            </li>
          ))}
        </ol>
      </div>

      {/* Texts note */}
      <div className="rounded-2xl border border-neutral-800 bg-neutral-900/40 p-5">
        <div className="flex items-center gap-2 mb-1.5">
          <span className="text-xl">💌</span>
          <h2 className="text-lg font-semibold">Texts work too</h2>
        </div>
        <p className="text-sm text-neutral-300 max-w-2xl">
          Incoming SMS and picture messages are captured the same way — routed in, saved to the
          dashboard, and scanned for one-time verification codes so you never lose a login code.
        </p>
      </div>

      {/* The pieces / services */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">The pieces</h2>
          <div className="flex gap-2">
            <Chip tag="local">on your Mac</Chip>
            <Chip tag="free">free</Chip>
            <Chip tag="paid">paid</Chip>
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {SERVICES.map((sv) => (
            <div key={sv.name} className="flex gap-3 rounded-xl border border-neutral-800 bg-neutral-900/40 p-4">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-neutral-800 text-xl">
                {sv.icon}
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium text-sm">{sv.name}</span>
                  <Chip tag={sv.tag}>{sv.tagLabel}</Chip>
                </div>
                <p className="text-sm text-neutral-400 mt-0.5">{sv.role}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Why it's good */}
      <div>
        <h2 className="text-lg font-semibold mb-4">What makes it good</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {HIGHLIGHTS.map((h) => (
            <div key={h.title} className="rounded-xl border border-neutral-800 bg-neutral-900/40 p-4">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-lg">{h.icon}</span>
                <h3 className="font-medium text-sm">{h.title}</h3>
              </div>
              <p className="text-sm text-neutral-400">{h.body}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
