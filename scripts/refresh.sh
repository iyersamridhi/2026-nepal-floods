#!/bin/sh
cd "$(dirname "$0")/.."
python3 scripts/scrape_official.py
python3 scripts/scrape_twitter.py || true
echo "Done at $(date)"
