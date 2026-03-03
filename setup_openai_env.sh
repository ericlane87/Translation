#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"

read -s -p "Paste OpenAI API key: " OPENAI_API_KEY
printf "\n"

if [[ -z "${OPENAI_API_KEY}" || "${OPENAI_API_KEY}" != sk-* ]]; then
  echo "Invalid key format. Expected key starting with sk-"
  exit 1
fi

cat > .env <<EOT
OPENAI_API_KEY=${OPENAI_API_KEY}
OPENAI_STT_MODEL=gpt-4o-mini-transcribe
PORT=4010
EOT

echo ".env created successfully."
