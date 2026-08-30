#!/usr/bin/env bash
# Refresh official + Twitter bulletin JSON. Soft-fail individual scrapers
# so a partial update can still be committed.
set -u
cd "$(dirname "$0")/.."

official_ok=0
twitter_ok=0

echo "==> Official sources"
if python3 scripts/scrape_official.py; then
  official_ok=1
else
  echo "WARN: scrape_official.py failed (exit $?)" >&2
fi

echo "==> Twitter / X accounts"
if python3 scripts/scrape_twitter.py; then
  twitter_ok=1
else
  echo "WARN: scrape_twitter.py failed (exit $?)" >&2
fi

echo "Done at $(date) (official_ok=$official_ok twitter_ok=$twitter_ok)"

if [[ "$official_ok" -eq 0 && "$twitter_ok" -eq 0 ]]; then
  echo "ERROR: both scrapers failed" >&2
  exit 1
fi

exit 0
