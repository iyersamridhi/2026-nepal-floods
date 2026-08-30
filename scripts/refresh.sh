#!/usr/bin/env bash
# Refresh official + Twitter bulletin JSON. Soft-fail individual scrapers
# so a partial update can still be committed.
#
# Env knobs (optional):
#   SKIP_OFFICIAL=1          — Twitter only
#   TWITTER_ROLE_FILTER=journalist|authority|all
#   SKIP_GROK=1              — raw tweet text, much faster
#   FORCE_RESCRAPE=1         — still write even if unchanged (does not re-Grok cached text)
set -u
cd "$(dirname "$0")/.."

official_ok=0
twitter_ok=0

if [[ "${SKIP_OFFICIAL:-0}" != "1" ]]; then
  echo "==> Official sources"
  if python3 scripts/scrape_official.py; then
    official_ok=1
  else
    echo "WARN: scrape_official.py failed (exit $?)" >&2
  fi
else
  echo "==> Skipping official scrape (SKIP_OFFICIAL=1)"
  official_ok=1
fi

echo "==> Twitter / X accounts (filter=${TWITTER_ROLE_FILTER:-all} skip_grok=${SKIP_GROK:-0})"
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
