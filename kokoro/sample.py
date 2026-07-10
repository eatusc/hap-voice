#!/usr/bin/env python3
"""Generate the hap-voice greeting in several Kokoro voices for A/B comparison."""
import os
from kokoro_onnx import Kokoro
import soundfile as sf

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "samples")
os.makedirs(OUT, exist_ok=True)

LINE = "Thanks for calling HelpAProduct. This is the assistant — who am I speaking with?"

# Top natural voices (a=American, f=female, m=male).
VOICES = ["af_heart", "af_bella", "af_nicole", "af_jessica", "am_michael"]

kokoro = Kokoro(os.path.join(HERE, "kokoro-v1.0.onnx"), os.path.join(HERE, "voices-v1.0.bin"))

for v in VOICES:
    samples, sr = kokoro.create(LINE, voice=v, speed=1.0, lang="en-us")
    path = os.path.join(OUT, f"{v}.wav")
    sf.write(path, samples, sr)
    dur = len(samples) / sr
    print(f"{v:12s} -> kokoro/samples/{v}.wav  ({dur:.1f}s @ {sr}Hz)")

print("\nCompare with Jessica (ElevenLabs) and pick a favorite.")
