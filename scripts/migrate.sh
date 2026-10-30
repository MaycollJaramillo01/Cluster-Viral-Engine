#!/usr/bin/env bash
set -euo pipefail
if [[ -z "${DATABASE_URL_UNPOOLED:-}" ]]; then echo 'DATABASE_URL_UNPOOLED required (direct Neon URL)' >&2; exit 2; fi
command -v psql >/dev/null || { echo 'psql is required' >&2; exit 2; }
cd "$(dirname "$0")/.."
for migration in db/migrations/[0-9]*.sql; do
  echo "Running ${migration} (ONLY on manually selected environment)" >&2
  psql "$DATABASE_URL_UNPOOLED" -v ON_ERROR_STOP=1 -1 -f "$migration"
done
