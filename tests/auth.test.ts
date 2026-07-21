import { afterEach, beforeEach, describe, expect, it } from "vitest"
import {
  SESSION_MAX_AGE,
  checkPassword,
  createSessionToken,
  isAuthConfigured,
  verifySessionToken,
} from "../lib/auth"

const NOW = 1_750_000_000_000

describe("dashboard auth", () => {
  const savedPassword = process.env.DASHBOARD_PASSWORD
  const savedSecret = process.env.DASHBOARD_SESSION_SECRET

  beforeEach(() => {
    process.env.DASHBOARD_PASSWORD = "correct horse battery staple"
    delete process.env.DASHBOARD_SESSION_SECRET
  })

  afterEach(() => {
    if (savedPassword === undefined) delete process.env.DASHBOARD_PASSWORD
    else process.env.DASHBOARD_PASSWORD = savedPassword
    if (savedSecret === undefined) delete process.env.DASHBOARD_SESSION_SECRET
    else process.env.DASHBOARD_SESSION_SECRET = savedSecret
  })

  it("round-trips a freshly minted session token", async () => {
    const token = await createSessionToken(NOW)
    expect(await verifySessionToken(token, NOW)).toBe(true)
    // Still valid just before expiry.
    expect(await verifySessionToken(token, NOW + (SESSION_MAX_AGE - 1) * 1000)).toBe(true)
  })

  it("rejects an expired token", async () => {
    const token = await createSessionToken(NOW)
    expect(await verifySessionToken(token, NOW + (SESSION_MAX_AGE + 1) * 1000)).toBe(false)
  })

  it("rejects missing and malformed tokens", async () => {
    expect(await verifySessionToken(undefined, NOW)).toBe(false)
    expect(await verifySessionToken("", NOW)).toBe(false)
    expect(await verifySessionToken("no-dot-here", NOW)).toBe(false)
    expect(await verifySessionToken(".sig-only", NOW)).toBe(false)
  })

  it("rejects a tampered token", async () => {
    const token = await createSessionToken(NOW)
    const [body, sig] = token.split(".")
    expect(await verifySessionToken(`${body}x.${sig}`, NOW)).toBe(false)
    expect(await verifySessionToken(`${body}.${sig.slice(0, -2)}aa`, NOW)).toBe(false)
  })

  it("invalidates sessions when the password (signing secret) rotates", async () => {
    const token = await createSessionToken(NOW)
    process.env.DASHBOARD_PASSWORD = "a different password"
    expect(await verifySessionToken(token, NOW)).toBe(false)
  })

  it("keeps sessions valid across a password rotation when a dedicated secret is set", async () => {
    process.env.DASHBOARD_SESSION_SECRET = "long random signing secret"
    const token = await createSessionToken(NOW)
    process.env.DASHBOARD_PASSWORD = "a different password"
    expect(await verifySessionToken(token, NOW)).toBe(true)
  })

  it("authenticates nobody when no password is configured", async () => {
    const token = await createSessionToken(NOW)
    delete process.env.DASHBOARD_PASSWORD
    expect(isAuthConfigured()).toBe(false)
    expect(await verifySessionToken(token, NOW)).toBe(false)
    expect(checkPassword("")).toBe(false)
    expect(checkPassword("anything")).toBe(false)
  })

  it("checkPassword matches only the exact configured password", () => {
    expect(checkPassword("correct horse battery staple")).toBe(true)
    expect(checkPassword("correct horse battery stapl")).toBe(false)
    expect(checkPassword("Correct horse battery staple")).toBe(false)
    expect(checkPassword("")).toBe(false)
  })
})
