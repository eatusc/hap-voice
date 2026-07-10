/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // The Twilio media-stream websocket is handled by the custom server (server.ts),
  // not by Next, so nothing special is needed here.
}

module.exports = nextConfig
