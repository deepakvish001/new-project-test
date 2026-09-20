#!/usr/bin/env bash
# Bring the whole demo up from nothing: database, seed data, dashboard.
#
#   ./scripts/demo.sh          then open http://localhost:3100
#
# Requires a local PostgreSQL 16 and Node 22.
set -euo pipefail
ROOT=$(cd "$(dirname "$0")/.." && pwd)
cd "$ROOT"

echo "==> Installing dependencies"
npm install --silent

echo "==> Building the database"
./scripts/dev-db.sh

echo "==> Building the dashboard"
npm run build --workspace=@bakaya/dashboard

echo
echo "==> Starting on http://localhost:3100"
DATABASE_URL="postgresql://bakaya_app:devpass@127.0.0.1:5432/bakaya" \
  npm run start --workspace=@bakaya/dashboard
