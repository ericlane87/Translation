#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"

KEY_FILE="paste_openai_key_here.txt"
ENV_FILE=".env"

if [[ ! -f "$KEY_FILE" ]]; then
  echo "Missing $KEY_FILE"
  exit 1
fi

RAW_KEY="$(awk 'NF && $1 !~ /^#/ {print; exit}' "$KEY_FILE" | tr -d '[:space:]')"

if [[ -z "$RAW_KEY" || "$RAW_KEY" == "PASTE_KEY_HERE" || "$RAW_KEY" != sk-* ]]; then
  echo "No valid key found in $KEY_FILE"
  exit 1
fi

if [[ -f "$ENV_FILE" ]]; then
  if grep -q '^OPENAI_API_KEY=' "$ENV_FILE"; then
    sed -i.bak "s|^OPENAI_API_KEY=.*|OPENAI_API_KEY=$RAW_KEY|" "$ENV_FILE"
  else
    printf "\nOPENAI_API_KEY=%s\n" "$RAW_KEY" >> "$ENV_FILE"
  fi
else
  cat > "$ENV_FILE" <<EOT
OPENAI_API_KEY=$RAW_KEY
OPENAI_STT_MODEL=gpt-4o-mini-transcribe
PORT=4010
EOT
fi

rm -f "$KEY_FILE"
echo "OPENAI key imported to $ENV_FILE and temp file removed."
