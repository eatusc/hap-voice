import { describe, expect, it } from "vitest"
import { cleanTranscript } from "../lib/stt/whisper"

describe("cleanTranscript", () => {
  it("drops whisper's bracketed non-speech tokens", () => {
    expect(cleanTranscript("[BLANK_AUDIO]")).toBe("")
    expect(cleanTranscript(" [MUSIC] Hello there. [SILENCE] ")).toBe("Hello there.")
  })

  it("drops parenthesized sound descriptions", () => {
    expect(cleanTranscript("(wind blowing) Hi, this is Sam.")).toBe("Hi, this is Sam.")
    expect(cleanTranscript("Hold on (dog barking) sorry about that.")).toBe(
      "Hold on sorry about that.",
    )
  })

  it("collapses whitespace and trims", () => {
    expect(cleanTranscript("  Hello   there.\n How are   you?  ")).toBe("Hello there. How are you?")
  })

  it("passes normal speech through unchanged", () => {
    expect(cleanTranscript("I'd like to leave a message for the sales team.")).toBe(
      "I'd like to leave a message for the sales team.",
    )
  })

  it("returns an empty string for pure noise", () => {
    expect(cleanTranscript(" [BLANK_AUDIO] (static) \n")).toBe("")
  })
})
