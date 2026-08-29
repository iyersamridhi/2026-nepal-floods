#!/usr/bin/env python3
"""
Fetch authority tweets → data/twitter_bulletin.json (separate from official news).

Requires TWITTER_BEARER_TOKEN for live fetch.
Manual tweets: add to data/seeds/twitter_manual.json

Grok (XAI_API_KEY): summarizes new tweets only.
"""

from __future__ import annotations

import hashlib
import json
import os
import sys
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

from grok_client import grok_summarize_tweet, load_dotenv

ROOT = Path(__file__).resolve().parent.parent
SOURCES = ROOT / "data" / "sources.json"
TWITTER_BULLETIN = ROOT / "data" / "twitter_bulletin.json"
MANUAL_SEEDS = ROOT / "data" / "seeds" / "twitter_manual.json"
CACHE_PATH = ROOT / "data" / "scraped" / "twitter_cache.json"


def load_cache() -> dict:
    if CACHE_PATH.exists():
        return json.loads(CACHE_PATH.read_text(encoding="utf-8"))
    return {}


def save_cache(cache: dict):
    CACHE_PATH.parent.mkdir(parents=True, exist_ok=True)
    CACHE_PATH.write_text(json.dumps(cache, ensure_ascii=False, indent=2), encoding="utf-8")


def tweet_hash(text: str) -> str:
    return hashlib.sha256(text.encode()).hexdigest()[:16]


def fetch_user_tweets(handle: str, bearer: str, keywords: list[str], max_results: int = 10) -> list[dict]:
  kw = "%20OR%20".join(k.replace(" ", "%20") for k in keywords[:6])
  q = f"from:{handle}%20({kw})"
  url = (
      f"https://api.twitter.com/2/tweets/search/recent?"
      f"query={q}&max_results={max_results}&tweet.fields=created_at,text"
  )
  req = urllib.request.Request(url, headers={"Authorization": f"Bearer {bearer}"})
  with urllib.request.urlopen(req, timeout=30) as resp:
      data = json.loads(resp.read().decode())
  return data.get("data", [])


def build_tweet_item(handle: str, name: str, regions: list, tweet_id: str, text: str, created_at: str, cache: dict, force: bool, source_url: str | None = None) -> tuple[dict, bool]:
    url = source_url or f"https://x.com/{handle}/status/{tweet_id}"
    tid = f"twitter-{tweet_id}"
    ch = tweet_hash(text)
    cached = cache.get(tid, {})

    if cached.get("contentHash") == ch and cached.get("item") and not force:
        item = dict(cached["item"])
        item["scrapeMethod"] = "cached"
        return item, False

    summary = text[:480]
    method = "raw"
    ai = grok_summarize_tweet(handle, text, url)
    if ai:
        summary = ai
        method = "grok"

    item = {
        "id": tid,
        "timestamp": created_at or datetime.now(timezone.utc).isoformat(),
        "region": regions,
        "source": f"Twitter @{handle}",
        "sourceUrl": url,
        "title": name,
        "summary": summary,
        "citation": f"Tweet by @{handle}",
        "scrapeMethod": method,
        "contentHash": ch,
    }
    cache[tid] = {
        "contentHash": ch,
        "fetchedAt": datetime.now(timezone.utc).isoformat(),
        "item": {k: v for k, v in item.items() if k != "scrapeMethod"},
    }
    return item, True


def load_manual_seeds(cache: dict, force: bool) -> tuple[list[dict], bool]:
    if not MANUAL_SEEDS.exists():
        return [], False
    seeds = json.loads(MANUAL_SEEDS.read_text(encoding="utf-8"))
    items, any_changed = [], False
    for s in seeds:
        handle = s.get("handle", "unknown")
        tweet_id = s.get("tweetId") or s.get("id") or tweet_hash(s.get("text", ""))
        text = s.get("text", "")
        item, changed = build_tweet_item(
            handle,
            s.get("name", handle),
            s.get("region", ["nepal"]),
            str(tweet_id),
            text,
            s.get("timestamp", ""),
            cache,
            force,
            s.get("sourceUrl"),
        )
        items.append(item)
        if changed:
            any_changed = True
    return items, any_changed


def main():
    load_dotenv()
    force = os.environ.get("FORCE_RESCRAPE", os.environ.get("FORCE_RESCrape", "0")) == "1"
    sources = json.loads(SOURCES.read_text(encoding="utf-8"))
    twitter_cfg = sources.get("twitter", {})
    cache = load_cache()
    items: list[dict] = []
    any_changed = False

    bearer = os.environ.get("TWITTER_BEARER_TOKEN")
    keywords = twitter_cfg.get("keywords", ["flood", "rasuwa", "missing"])
    twitter_enabled = twitter_cfg.get("enabled", False) or bool(bearer)

    if bearer and twitter_enabled:
        for acct in twitter_cfg.get("accounts", []):
            handle = acct["handle"]
            try:
                tweets = fetch_user_tweets(handle, bearer, keywords)
            except Exception as e:
                print(f"@{handle}: {e}", file=sys.stderr)
                continue
            for tw in tweets:
                item, changed = build_tweet_item(
                    handle,
                    acct.get("name", handle),
                    acct.get("region", ["nepal"]),
                    tw["id"],
                    tw.get("text", ""),
                    tw.get("created_at", ""),
                    cache,
                    force,
                )
                items.append(item)
                if changed:
                    any_changed = True
    else:
        print("Twitter API not configured — using manual seeds only", file=sys.stderr)

    manual, manual_changed = load_manual_seeds(cache, force)
    items.extend(manual)
    any_changed = any_changed or manual_changed

    save_cache(cache)

    # Dedupe by id
    seen = set()
    deduped = []
    for it in items:
        if it["id"] in seen:
            continue
        seen.add(it["id"])
        deduped.append(it)
    deduped.sort(key=lambda x: x.get("timestamp", ""), reverse=True)

    grok_on = bool(os.environ.get("XAI_API_KEY") or os.environ.get("GROK_API_KEY"))

    if not any_changed and TWITTER_BULLETIN.exists() and not force:
        existing = json.loads(TWITTER_BULLETIN.read_text(encoding="utf-8"))
        existing["generatedAt"] = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
        existing["skippedUnchanged"] = True
        existing["summarizer"] = "grok" if grok_on else "raw"
        TWITTER_BULLETIN.write_text(json.dumps(existing, ensure_ascii=False, indent=2), encoding="utf-8")
        print(f"No Twitter changes ({len(existing.get('items', []))} items)", file=sys.stderr)
        return

    bulletin = {
        "generatedAt": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        "note": "Authority Twitter/X posts — summarized with link. Verify on original tweet; not official confirmation.",
        "summarizer": "grok" if grok_on else "raw",
        "skippedUnchanged": False,
        "items": deduped,
    }
    TWITTER_BULLETIN.write_text(json.dumps(bulletin, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Wrote {len(deduped)} Twitter bulletin items", file=sys.stderr)


if __name__ == "__main__":
    main()
