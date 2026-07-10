// Twilio Media Streams websocket protocol helpers.
// https://www.twilio.com/docs/voice/media-streams/websocket-messages

export interface TwilioStartEvent {
  event: "start"
  streamSid: string
  start: {
    streamSid: string
    callSid: string
    accountSid: string
    tracks: string[]
    mediaFormat: { encoding: string; sampleRate: number; channels: number }
    customParameters?: Record<string, string>
  }
}

export interface TwilioMediaEvent {
  event: "media"
  streamSid: string
  media: { track: string; chunk: string; timestamp: string; payload: string }
}

export interface TwilioMarkEvent {
  event: "mark"
  streamSid: string
  mark: { name: string }
}

export interface TwilioStopEvent {
  event: "stop"
  streamSid: string
  stop: { accountSid: string; callSid: string }
}

export type TwilioInbound =
  | { event: "connected"; protocol: string; version: string }
  | TwilioStartEvent
  | TwilioMediaEvent
  | TwilioMarkEvent
  | TwilioStopEvent

// ─── Outbound message builders ──────────────────────────────────────────────

export function mediaMessage(streamSid: string, mulawBase64: string): string {
  return JSON.stringify({ event: "media", streamSid, media: { payload: mulawBase64 } })
}

export function markMessage(streamSid: string, name: string): string {
  return JSON.stringify({ event: "mark", streamSid, mark: { name } })
}

export function clearMessage(streamSid: string): string {
  return JSON.stringify({ event: "clear", streamSid })
}
