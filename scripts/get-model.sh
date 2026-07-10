#!/usr/bin/env bash
# Downloads the whisper.cpp English model used for speech-to-text.
# Usage: bash scripts/get-model.sh [base.en|small.en|tiny.en]
set -euo pipefail

MODEL="${1:-base.en}"
DEST="models/ggml-${MODEL}.bin"
URL="https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-${MODEL}.bin"

mkdir -p models
if [ -f "$DEST" ]; then
  echo "$DEST already present."
  exit 0
fi

echo "Downloading ggml-${MODEL}.bin…"
curl -L --fail -o "$DEST" "$URL"
echo "Saved to $DEST"
echo "Also ensure whisper.cpp is installed:  brew install whisper-cpp"
