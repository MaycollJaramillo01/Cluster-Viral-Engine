#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
# The TypeScript runner validates the direct URL, serializes migrations and checks SHA256.
npm run db:migrate -- "$@"
