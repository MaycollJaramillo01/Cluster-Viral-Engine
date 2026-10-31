#!/usr/bin/env bash
set -euo pipefail

project_root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
cd -- "$project_root"

# Use only this project's cluster. Never stop a system PostgreSQL service.
pg_bin="${CVE_PG_BIN:-}"
if [[ -z "$pg_bin" ]] && command -v pg_ctl >/dev/null 2>&1; then
  pg_bin="$(dirname -- "$(command -v pg_ctl)")"
fi
if [[ -z "$pg_bin" ]] && command -v pg_config >/dev/null 2>&1; then
  pg_bin="$(pg_config --bindir)"
fi
if [[ -z "$pg_bin" || ! -x "$pg_bin/pg_ctl" || ! -x "$pg_bin/initdb" ]]; then
  echo 'PostgreSQL 17 tools required. Set CVE_PG_BIN to their bin directory.' >&2
  exit 1
fi
if [[ "$(id -u)" == 0 ]]; then
  echo 'Run as a regular user; PostgreSQL cannot initialize a cluster as root.' >&2
  exit 1
fi

data="$project_root/.local/postgres"
if [[ -f "$project_root/.phase00-postgres/PG_VERSION" ]]; then
  data="$project_root/.phase00-postgres"
fi
if [[ -L "$project_root/.local" || -L "$data" ]]; then
  echo 'Refusing a symlinked local PostgreSQL directory.' >&2
  exit 1
fi
umask 077
mkdir -p -- "$(dirname -- "$data")"
if [[ ! -f "$data/PG_VERSION" ]]; then
  "$pg_bin/initdb" -D "$data" -U postgres --auth-local=trust --auth-host=trust --no-locale -E UTF8
fi
if ! "$pg_bin/pg_ctl" -D "$data" status >/dev/null 2>&1; then
  "$pg_bin/pg_ctl" -D "$data" -l "$data/server.log" \
    -o "-p 55432 -h 127.0.0.1 -c unix_socket_directories=''" -w start
fi

npm ci --no-fund
npm run local:bootstrap
npm run db:migrate
exec npm run dev
