import "./lib/load-env" // must be first — populates process.env before config is read
import { createServer } from "node:http"
import { parse } from "node:url"
import next from "next"
import { WebSocketServer, WebSocket } from "ws"
import { config } from "./lib/config"
import { CallSession } from "./lib/telephony/call-session"

const dev = process.env.NODE_ENV !== "production"
const app = next({ dev })
const handle = app.getRequestHandler()

async function main() {
  await app.prepare()

  const server = createServer((req, res) => {
    handle(req, res, parse(req.url || "", true))
  })

  // Twilio Media Streams connect here.
  const wss = new WebSocketServer({ noServer: true })

  server.on("upgrade", (req, socket, head) => {
    const { pathname } = parse(req.url || "", true)
    if (pathname === "/media") {
      wss.handleUpgrade(req, socket, head, (ws) => onMediaSocket(ws))
    } else {
      socket.destroy()
    }
  })

  server.listen(config.port, () => {
    console.log(`▶ hap-voice on http://localhost:${config.port}`)
    console.log(`  media stream ws:  ws://localhost:${config.port}/media`)
    if (config.publicHost) console.log(`  public host:      ${config.publicHost}`)
    else console.log(`  (set PUBLIC_HOST to your tunnel host for Twilio to reach /media)`)
  })
}

function onMediaSocket(ws: WebSocket) {
  const session = new CallSession({
    send: (text) => {
      if (ws.readyState === WebSocket.OPEN) ws.send(text)
    },
    close: () => ws.close(),
  })

  ws.on("message", (data) => {
    void session.handleMessage(data.toString())
  })
  ws.on("close", () => {
    void session.finalize()
  })
  ws.on("error", (err) => {
    console.error("[media ws] error:", err.message)
  })
}

main().catch((err) => {
  console.error("Fatal:", err)
  process.exit(1)
})
