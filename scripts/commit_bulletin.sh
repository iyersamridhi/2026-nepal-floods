#!/usr/bin/env bash
# Commit scraped bulletin JSON onto latest main without rebase conflicts.
# Fresh scrape always wins for data/bulletin.json, twitter_bulletin.json, scraped/.
set -euo pipefail

cd "$(dirname "$0")/.."

git config user.name "github-actions[bot]"
git config user.email "41898282+github-actions[bot]@users.noreply.github.com"

STASH="/tmp/bulletin-refresh-$$"
mkdir -p "$STASH"

if [[ ! -f data/bulletin.json && ! -f data/twitter_bulletin.json ]]; then
  echo "No bulletin output files found — nothing to commit"
  exit 0
fi

cp -a data/bulletin.json "$STASH/" 2>/dev/null || true
cp -a data/twitter_bulletin.json "$STASH/" 2>/dev/null || true
if [[ -d data/scraped ]]; then
  cp -a data/scraped "$STASH/scraped"
fi

restore_outputs() {
  [[ -f "$STASH/bulletin.json" ]] && cp -a "$STASH/bulletin.json" data/bulletin.json
  [[ -f "$STASH/twitter_bulletin.json" ]] && cp -a "$STASH/twitter_bulletin.json" data/twitter_bulletin.json
  if [[ -d "$STASH/scraped" ]]; then
    rm -rf data/scraped
    cp -a "$STASH/scraped" data/scraped
  fi
}

try_commit_push() {
  restore_outputs
  git add data/bulletin.json data/twitter_bulletin.json data/scraped/ 2>/dev/null || true
  if git diff --staged --quiet; then
    echo "No bulletin changes to commit"
    return 0
  fi
  git commit -m "chore: refresh official and Twitter bulletins"
  git push origin HEAD:main
}

# Sync to latest main, then lay scrape results on top (avoids JSON rebase wars)
git fetch origin main
git reset --hard origin/main

if try_commit_push; then
  echo "Bulletin commit pushed"
  exit 0
fi

echo "Push rejected — retrying against latest main…"
for _ in 1 2 3; do
  sleep 3
  git fetch origin main
  git reset --hard origin/main
  if try_commit_push; then
    echo "Bulletin commit pushed on retry"
    exit 0
  fi
done

echo "Failed to push bulletin refresh after retries" >&2
exit 1
