// Twilio webhook signature validation (X-Twilio-Signature).
//
// Twilio signs each webhook with HMAC-SHA1 over the full request URL plus the
// POST params (sorted by key, key and value concatenated), keyed by the account
// auth token, base64-encoded. See:
// https://www.twilio.com/docs/usage/security#validating-requests
//
// Behind the Cloudflare Tunnel the local request URL is http://localhost:3010/…,
// but Twilio signed against https://<PUBLIC_HOST><path>. So we reconstruct the
// public URL from config.publicHost rather than trusting request.url.

import { createHmac, timingSafeEqual } from "node:crypto"
import { config } from "@/lib/config"

// The exact URL Twilio used when signing: https + the public host + the path.
function publicUrl(request: Request, path: string): string {
  const host =
    config.publicHost ||
    request.headers.get("x-forwarded-host") ||
    request.headers.get("host") ||
    ""
  return `https://${host.replace(/^https?:\/\//, "")}${path}`
}

export function expectedSignature(url: string, params: Record<string, string>): string {
  const data = Object.keys(params)
    .sort()
    .reduce((acc, key) => acc + key + params[key], url)
  return createHmac("sha1", config.twilio.authToken).update(data, "utf-8").digest("base64")
}

// True if the request carries a valid Twilio signature. Fails closed: when
// validation is enabled but the token is missing or the signature is absent or
// wrong, this returns false so the caller can reject the request.
export function isValidTwilioRequest(
  request: Request,
  path: string,
  params: Record<string, string>,
): boolean {
  if (config.twilio.skipValidation) return true
  if (!config.twilio.authToken) return false

  const provided = request.headers.get("x-twilio-signature") || ""
  const expected = expectedSignature(publicUrl(request, path), params)

  const a = Buffer.from(provided)
  const b = Buffer.from(expected)
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}

// Collect the POST params from an already-parsed form into a plain object,
// which is both what the route handlers consume and what the signature covers.
export function formParams(form: FormData): Record<string, string> {
  const params: Record<string, string> = {}
  for (const [key, value] of form.entries()) params[key] = String(value)
  return params
}
