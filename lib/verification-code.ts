// Best-effort detection of a one-time / verification code inside an SMS body.
// Home-grown; tuned for common real-world OTP shapes without matching phone
// numbers, times, or prices. Only fires when a code keyword is present.

const KEYWORD = /\b(code|otp|pin|passcode|verification|verify|confirm|one[-\s]?time)\b/i
const KEYWORD_POS = /\b(code|otp|pin|passcode|verification|verify|confirm)\b/i

export function detectVerificationCode(body: string): string | null {
  if (!body) return null

  const hasKeyword = KEYWORD.test(body) || /\b[A-Za-z]-\d{4,8}\b/.test(body)
  if (!hasKeyword) return null

  const candidates: Array<{ i: number; v: string }> = []

  // Hyphenated numeric code, e.g. "739-204" → "739204".
  for (const m of body.matchAll(/(?<![0-9])(\d{3})-(\d{3})(?![0-9])/g)) {
    candidates.push({ i: m.index ?? 0, v: m[1] + m[2] })
  }

  // A 4–8 digit run, optionally prefixed like "G-539201" → "539201".
  // The negative lookarounds keep it from grabbing part of a longer number.
  for (const m of body.matchAll(/(?<![0-9])(?:[A-Za-z]-)?(\d{4,8})(?![0-9])/g)) {
    candidates.push({ i: m.index ?? 0, v: m[1] })
  }

  if (candidates.length === 0) return null

  // Prefer a candidate that appears at/after the keyword; otherwise the first one.
  const kwPos = body.search(KEYWORD_POS)
  candidates.sort((a, b) => a.i - b.i)
  const after = kwPos >= 0 ? candidates.filter((c) => c.i >= kwPos) : []
  return (after[0] ?? candidates[0]).v
}
