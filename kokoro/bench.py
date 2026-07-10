import time, os
from kokoro_onnx import Kokoro

HERE = os.path.dirname(os.path.abspath(__file__))
k = Kokoro(os.path.join(HERE, "kokoro-v1.0.onnx"), os.path.join(HERE, "voices-v1.0.bin"))
line = "Thanks for calling HelpAProduct. This is the assistant. Who am I speaking with?"

k.create("hello", voice="af_bella", lang="en-us")  # warmup
for _ in range(3):
    t = time.time()
    s, sr = k.create(line, voice="af_bella", lang="en-us")
    gen = time.time() - t
    audio = len(s) / sr
    rtf = gen / audio
    tag = "faster than realtime" if gen < audio else "SLOWER than realtime"
    print("  gen %.2fs for %.1fs audio  (RTF %.2f, %s)" % (gen, audio, rtf, tag))
