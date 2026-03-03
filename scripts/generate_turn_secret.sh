#!/usr/bin/env bash
set -euo pipefail

# Generates a strong secret for coturn static-auth-secret.
openssl rand -base64 48 | tr -d '\n'
echo
