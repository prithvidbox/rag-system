#!/usr/bin/env bash
set -euo pipefail

if [ ! -f .env ]; then
  cp .env.example .env
  echo "Created .env from template; update secrets before running in production." >&2
fi

docker compose pull

docker compose up -d --build

echo "Services are starting. UI: http://localhost:3000"
