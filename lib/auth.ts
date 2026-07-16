// Session auth for the dashboard. Web Crypto only, so this module is safe to
// import from both the Edge middleware and Node route handlers.
//
// The dashboard is gated by a single shared password (DASHBOARD_PASSWORD). A
// successful login mints a short signed token stored in an HttpOnly cookie;
// middleware verifies the signature + expiry on every dashboard request. The
// telephony webhooks are NOT gated here (they verify Twilio/Retell signatures
// themselves) — see middleware.ts for the public allowlist.

const enc = new TextEncoder()

export const SESSION_COOKIE = "hv_session"
export const SESSION_MAX_AGE = 60 * 60 * 24 * 30 // 30 days, in seconds

function b64urlFromBytes(bytes: Uint8Array): string {
  let bin = ""
  for (const b of bytes) bin += String.fromCharCode(b)
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")
}

function bytesFromB64url(s: string): Uint8Array {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4)
  const bin = atob(b64)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

// Constant-time compare over equal-length byte arrays.
function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i]
  return diff === 0
}

// Signing key: a dedicated secret if provided, else derived from the password
// (so rotating the password also invalidates existing sessions).
function sessionSecret(): string {
  return process.env.DASHBOARD_SESSION_SECRET || process.env.DASHBOARD_PASSWORD || ""
}

async function hmac(body: string, secret: string): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  )
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(body))
  return new Uint8Array(sig)
}

export async function createSessionToken(nowMs: number): Promise<string> {
  const secret = sessionSecret()
  const body = b64urlFromBytes(
    enc.encode(JSON.stringify({ exp: Math.floor(nowMs / 1000) + SESSION_MAX_AGE })),
  )
  const sig = b64urlFromBytes(await hmac(body, secret))
  return `${body}.${sig}`
}

export async function verifySessionToken(token: string | undefined, nowMs: number): Promise<boolean> {
  if (!token) return false
  const secret = sessionSecret()
  if (!secret) return false // no password configured → nobody is authenticated
  const dot = token.indexOf(".")
  if (dot < 1) return false
  const body = token.slice(0, dot)
  const sig = token.slice(dot + 1)
  const expected = b64urlFromBytes(await hmac(body, secret))
  if (!timingSafeEqual(enc.encode(sig), enc.encode(expected))) return false
  try {
    const payload = JSON.parse(new TextDecoder().decode(bytesFromB64url(body)))
    return typeof payload.exp === "number" && payload.exp * 1000 > nowMs
  } catch {
    return false
  }
}

// True only when DASHBOARD_PASSWORD is set AND matches the submitted value.
export function checkPassword(submitted: string): boolean {
  const expected = process.env.DASHBOARD_PASSWORD || ""
  if (!expected) return false
  return timingSafeEqual(enc.encode(submitted), enc.encode(expected))
}

export function isAuthConfigured(): boolean {
  return Boolean(process.env.DASHBOARD_PASSWORD)
}
