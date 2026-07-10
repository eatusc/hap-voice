#!/usr/bin/env python3
"""Persistent local Kokoro TTS service for hap-voice.

Loads the Kokoro model once and serves synthesis over HTTP so the call pipeline
doesn't pay model-load latency per utterance. Node's lib/tts/kokoro.ts calls it.

  POST /tts  {"text": "...", "voice": "af_bella", "speed": 1.0}  -> audio/wav (24kHz PCM16)
  GET  /health                                                    -> "ok"
"""
import io
import json
import os
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

import soundfile as sf
from kokoro_onnx import Kokoro

HERE = os.path.dirname(os.path.abspath(__file__))
PORT = int(os.environ.get("KOKORO_PORT", "5111"))

kokoro = Kokoro(
    os.path.join(HERE, "kokoro-v1.0.onnx"),
    os.path.join(HERE, "voices-v1.0.bin"),
)


class Handler(BaseHTTPRequestHandler):
    def log_message(self, *args):
        pass  # keep the launchd log quiet

    def do_GET(self):
        if self.path == "/health":
            self._send(200, b"ok", "text/plain")
        else:
            self._send(404, b"not found", "text/plain")

    def do_POST(self):
        try:
            length = int(self.headers.get("Content-Length", "0"))
            body = json.loads(self.rfile.read(length) or b"{}")
            text = (body.get("text") or "").strip()
            voice = body.get("voice") or "af_bella"
            speed = float(body.get("speed", 1.0))
            if not text:
                self._send(400, b"empty text", "text/plain")
                return
            samples, sr = kokoro.create(text, voice=voice, speed=speed, lang="en-us")
            buf = io.BytesIO()
            sf.write(buf, samples, sr, format="WAV", subtype="PCM_16")
            self._send(200, buf.getvalue(), "audio/wav")
        except Exception as e:  # noqa: BLE001
            self._send(500, str(e).encode(), "text/plain")

    def _send(self, code, data, ctype):
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)


if __name__ == "__main__":
    print(f"kokoro-tts ready on 127.0.0.1:{PORT}", flush=True)
    ThreadingHTTPServer(("127.0.0.1", PORT), Handler).serve_forever()
