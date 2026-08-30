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
import re
import sys
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

from grok_client import grok_summarize_tweet, load_dotenv, strip_summary_urls

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


def sanitize_bearer(token: str | None) -> str | None:
    if not token:
        return None
    token = token.strip().strip('"').strip("'")
    if token.lower().startswith("bearer "):
        token = token[7:].strip()
    token = "".join(token.split())
    return token or None


def is_flood_relevant(text: str, priority: str, keywords: list[str], exclude: list[str]) -> bool:
    """
    Keep Nepal-flood posts; drop unrelated diplomatic noise.

    - excludeKeywords always drop (Uzbekistan yoga, Mann Ki Baat, etc.)
    - related accounts (MEA / embassies): must match a flood keyword
    - disaster-primary accounts (NDRRMA / police / MoFA / Army / MoHA):
      match keyword OR any Devanagari content (Nepali notices often omit English place names)
    """
    raw = text or ""
    low = raw.lower()
    for ex in exclude:
        if ex and ex.lower() in low:
            return False

    keys = [k for k in keywords if k]
    if any(k.lower() in low for k in keys):
        return True

    if priority == "disaster":
        # Nepali-script authority posts about the response
        if re.search(r"[\u0900-\u097F]", raw):
            return True
        # Image-only English captions that still name the flood response
        if re.search(r"\b(update|relief|rescue|missing|injured)\b", low):
            return True
    return False


def fetch_user_tweets(
    handle: str,
    bearer: str,
    keywords: list[str] | None = None,
    exclude: list[str] | None = None,
    priority: str = "related",
    max_results: int = 40,
) -> list[dict]:
    """
    Pull recent posts from a curated authority account, then soft-filter
    for Nepal flood relevance (wide EN + Nepali keywords).
    """
    max_results = max(10, min(int(max_results), 100))
    q = urllib.parse.quote(f"from:{handle}", safe="")
    url = (
        f"https://api.twitter.com/2/tweets/search/recent?"
        f"query={q}&max_results={max_results}&tweet.fields=created_at,text"
    )
    req = urllib.request.Request(url, headers={"Authorization": f"Bearer {bearer}"})
    with urllib.request.urlopen(req, timeout=30) as resp:
        data = json.loads(resp.read().decode())
    tweets = data.get("data", []) or []
    keywords = keywords or []
    exclude = exclude or []
    return [tw for tw in tweets if is_flood_relevant(tw.get("text", ""), priority, keywords, exclude)]


def assign_themes(text: str) -> list[str]:
    low = (text or "").lower()
    themes = []
    checks = [
        ("hospitals", ["hospital", "injured", "discharged", "treatment", "under treatment", "अस्पताल", "घाइते", "उपचार", "डिश्चार्ज"]),
        ("rescue", ["rescue", "rescued", "उद्धार", "उद्वार", "helicopter", "search and rescue", "खोज"]),
        (
            "missing",
            [
                "missing",
                "unaccounted",
                "lost",
                "found",
                "rescued",
                "बेपत्ता",
                "हराएको",
                "सम्पर्कमा नआएका",
                "उद्वार",
                "उद्धार",
                "विवरण",
                "discharged",
                "under treatment",
                "patient",
                "names",
            ],
        ),
        ("remains", ["unidentified", "dead body", "bodies recovered", "शव", "remains", "forensic", "dna"]),
        ("relief", ["relief", "राहत", "cash support", "food", "fuel", "truck"]),
        ("contacts", ["hotline", "control room", "helpline", "whatsapp", "emergency contact", "सम्पर्क", "0086", "+86"]),
        ("briefing", ["press", "briefing", "update", "अपडेट", "press release", "situation"]),
    ]
    for theme, words in checks:
        if any(w.lower() in low for w in words):
            themes.append(theme)
    # Patient / rescued name-lists also belong under People lists
    if "hospitals" in themes and "missing" not in themes:
        themes.append("missing")
    if "rescue" in themes and any(w in low for w in ["rescued", "उद्वार", "उद्धार", "विवरण", "list", "names"]):
        if "missing" not in themes:
            themes.append("missing")
    return themes or ["briefing"]


def build_tweet_item(handle: str, name: str, regions: list, tweet_id: str, text: str, created_at: str, cache: dict, force: bool, source_url: str | None = None) -> tuple[dict, bool]:
    url = source_url or f"https://x.com/{handle}/status/{tweet_id}"
    tid = f"twitter-{tweet_id}"
    ch = tweet_hash(text)
    cached = cache.get(tid, {})

    if cached.get("contentHash") == ch and cached.get("item") and not force:
        item = dict(cached["item"])
        item["summary"] = strip_summary_urls(item.get("summary", ""))
        item.setdefault("themes", assign_themes(f"{item.get('summary','')} {text}"))
        item["scrapeMethod"] = "cached"
        return item, False

    summary = strip_summary_urls(text[:480])
    method = "raw"
    ai = grok_summarize_tweet(handle, text, url)
    if ai:
        summary = strip_summary_urls(ai)
        method = "grok"

    # Normalize tweet times (API returns UTC) to ISO string; UI formats Nepal time
    ts = created_at or datetime.now(timezone.utc).isoformat()
    if ts.endswith("Z"):
        pass
    elif re.match(r"^\d{4}-\d{2}-\d{2}T", ts) and "+" not in ts and not ts.endswith("Z"):
        ts = ts + "Z"

    item = {
        "id": tid,
        "timestamp": ts,
        "publishedLabel": "",
        "region": regions,
        "source": f"Twitter @{handle}",
        "sourceUrl": url,
        "title": name,
        "summary": summary,
        "citation": f"Tweet by @{handle}",
        "themes": assign_themes(f"{summary} {text}"),
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
    live_ok = False

    bearer = sanitize_bearer(os.environ.get("TWITTER_BEARER_TOKEN"))
    keywords = twitter_cfg.get("keywords", ["flood", "rasuwa", "missing"])
    exclude = twitter_cfg.get("excludeKeywords", [])
    twitter_enabled = twitter_cfg.get("enabled", False) or bool(bearer)

    if bearer and twitter_enabled:
        payment_blocked = False
        for acct in twitter_cfg.get("accounts", []):
            if payment_blocked:
                break
            handle = acct["handle"]
            priority = acct.get("priority", "related")
            try:
                tweets = fetch_user_tweets(
                    handle,
                    bearer,
                    keywords=keywords,
                    exclude=exclude,
                    priority=priority,
                )
            except Exception as e:
                msg = str(e)
                print(f"@{handle}: {msg}", file=sys.stderr)
                if "402" in msg or "Payment Required" in msg:
                    print(
                        "X/Twitter API returned 402 Payment Required — "
                        "Recent Search needs a paid Basic+ plan. Falling back to manual seeds.",
                        file=sys.stderr,
                    )
                    payment_blocked = True
                continue
            live_ok = True
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
        if not live_ok:
            print("No live tweets fetched — using manual seeds", file=sys.stderr)
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

    grok_on = bool(
        sanitize_bearer(os.environ.get("XAI_API_KEY"))
        or sanitize_bearer(os.environ.get("X_AI"))
        or sanitize_bearer(os.environ.get("GROK_API_KEY"))
    )

    note = (
        "Authority Twitter/X posts — summarized with link. Verify on original tweet; not official confirmation."
        if live_ok
        else "Curated authority post summaries (live X API unavailable or unpaid). Follow accounts below for newest posts."
    )

    if not any_changed and TWITTER_BULLETIN.exists() and not force:
        existing = json.loads(TWITTER_BULLETIN.read_text(encoding="utf-8"))
        existing["generatedAt"] = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
        existing["skippedUnchanged"] = True
        existing["summarizer"] = "grok" if grok_on else "raw"
        existing["liveFetch"] = live_ok
        existing["note"] = note
        TWITTER_BULLETIN.write_text(json.dumps(existing, ensure_ascii=False, indent=2), encoding="utf-8")
        print(f"No Twitter changes ({len(existing.get('items', []))} items)", file=sys.stderr)
        return

    bulletin = {
        "generatedAt": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        "note": note,
        "liveFetch": live_ok,
        "summarizer": "grok" if grok_on else "raw",
        "skippedUnchanged": False,
        "items": deduped,
    }
    TWITTER_BULLETIN.write_text(json.dumps(bulletin, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Wrote {len(deduped)} Twitter bulletin items (live={live_ok})", file=sys.stderr)


if __name__ == "__main__":
    main()
