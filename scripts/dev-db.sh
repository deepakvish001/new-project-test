#!/usr/bin/env bash
# Rebuild the local development database from scratch and seed it with demo data.
#
# Creates TWO roles, deliberately:
#   bakaya_app   what the application connects as. RLS enforced, and NO update/delete on
#                the evidence tables (message_log, inbound_message, ladder_event).
#   bakaya_seed  DEVELOPMENT ONLY. Full DML so the seed can reset between runs. It is not
#                in db/schema.sql precisely so it can never reach a production database.
#
# Usage: ./scripts/dev-db.sh
set -euo pipefail

DB=${DB:-bakaya}
ROOT=$(cd "$(dirname "$0")/.." && pwd)
run() { su postgres -c "psql -q -v ON_ERROR_STOP=1 $*"; }

echo "==> Recreating database '$DB'"
run "-c 'DROP DATABASE IF EXISTS $DB'"
run "-c 'CREATE DATABASE $DB'"

echo "==> Applying db/schema.sql"
run "-d $DB -f $ROOT/db/schema.sql"

echo "==> Configuring roles"
run "-d $DB -c \"ALTER ROLE bakaya_app PASSWORD 'devpass'\""
run "-d $DB -c \"DO \\\$\\\$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='bakaya_seed') THEN CREATE ROLE bakaya_seed LOGIN NOBYPASSRLS; END IF; END \\\$\\\$\""
run "-d $DB -c \"ALTER ROLE bakaya_seed PASSWORD 'devpass'\""
run "-d $DB -c 'GRANT USAGE ON SCHEMA public TO bakaya_seed'"
run "-d $DB -c 'GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO bakaya_seed'"
run "-d $DB -c 'GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO bakaya_seed'"

echo "==> Seeding demo data"
cd "$ROOT"
DATABASE_URL="postgresql://bakaya_seed:devpass@127.0.0.1:5432/$DB" \
  npm run seed --workspace=@bakaya/db

echo
echo "Done. App connection string (RLS enforced, evidence append-only):"
echo "  postgresql://bakaya_app:devpass@127.0.0.1:5432/$DB"
