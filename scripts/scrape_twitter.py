#!/usr/bin/env python3
"""
Fetch authority + journalist tweets → data/twitter_bulletin.json (separate from official news).

Requires TWITTER_BEARER_TOKEN for live fetch.
Accounts in data/sources.json twitter.accounts use role=authority|journalist.
Manual tweets: add to data/seeds/twitter_manual.json (optional role field).

Grok (XAI_API_KEY): summarizes new tweets only.
"""

from __future__ import annotations

import hashlib
import json
import os
import re
import sys
import urllib.error
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


def api_get(url: str, bearer: str) -> dict:
    req = urllib.request.Request(url, headers={"Authorization": f"Bearer {bearer}"})
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            return json.loads(resp.read().decode())
    except urllib.error.HTTPError as e:
        body = ""
        try:
            body = e.read().decode("utf-8", errors="replace")[:500]
        except Exception:
            pass
        raise RuntimeError(f"HTTP Error {e.code}: {e.reason}. {body}") from e


def resolve_user_id(handle: str, bearer: str, cache: dict) -> str:
    key = f"user_id:{handle.lower()}"
    ids = cache.setdefault("_user_ids", {})
    if ids.get(key):
        return ids[key]
    data = api_get(
        f"https://api.twitter.com/2/users/by/username/{urllib.parse.quote(handle)}",
        bearer,
    )
    uid = (data.get("data") or {}).get("id")
    if not uid:
        raise RuntimeError(f"No user id for @{handle}: {data}")
    ids[key] = uid
    return uid


def fetch_user_tweets(
    handle: str,
    bearer: str,
    keywords: list[str] | None = None,
    exclude: list[str] | None = None,
    priority: str = "related",
    max_results: int = 40,
    cache: dict | None = None,
) -> list[dict]:
    """
    Pull recent posts from a curated account, then soft-filter for flood relevance.

    Prefer user timeline (cheaper / separate quota from Recent Search). Fall back
    to recent search `from:handle` only if timeline fails for a non-billing reason.
    """
    max_results = max(5, min(int(max_results), 100))
    keywords = keywords or []
    exclude = exclude or []
    cache = cache if cache is not None else {}
    tweets: list[dict] = []
    method = "timeline"

    try:
        uid = resolve_user_id(handle, bearer, cache)
        # timeline max_results must be 5–100
        url = (
            f"https://api.twitter.com/2/users/{uid}/tweets?"
            f"max_results={max_results}&tweet.fields=created_at,text&exclude=retweets,replies"
        )
        data = api_get(url, bearer)
        tweets = data.get("data", []) or []
    except Exception as timeline_err:
        msg = str(timeline_err)
        # Billing / plan block — don't burn more credits on search
        if "402" in msg or "Payment Required" in msg:
            raise
        print(f"@{handle}: timeline failed ({msg}); trying recent search", file=sys.stderr)
        method = "search"
        q = urllib.parse.quote(f"from:{handle}", safe="")
        url = (
            f"https://api.twitter.com/2/tweets/search/recent?"
            f"query={q}&max_results={max(10, min(max_results, 100))}"
            f"&tweet.fields=created_at,text"
        )
        data = api_get(url, bearer)
        tweets = data.get("data", []) or []

    kept = [tw for tw in tweets if is_flood_relevant(tw.get("text", ""), priority, keywords, exclude)]
    print(f"@{handle}: {method} {len(tweets)} raw → {len(kept)} flood-relevant", file=sys.stderr)
    return kept


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


def build_tweet_item(
    handle: str,
    name: str,
    regions: list,
    tweet_id: str,
    text: str,
    created_at: str,
    cache: dict,
    force: bool,
    source_url: str | None = None,
    role: str = "authority",
) -> tuple[dict, bool]:
    url = source_url or f"https://x.com/{handle}/status/{tweet_id}"
    tid = f"twitter-{tweet_id}"
    ch = tweet_hash(text)
    cached = cache.get(tid, {})
    role = role if role in ("authority", "journalist") else "authority"

    if cached.get("contentHash") == ch and cached.get("item"):
        # Never re-Grok unchanged text — FORCE_RESCRAPE only forces a fresh API pull / write
        item = dict(cached["item"])
        item["summary"] = strip_summary_urls(item.get("summary", ""))
        item.setdefault("themes", assign_themes(f"{item.get('summary','')} {text}"))
        item["role"] = role
        item["scrapeMethod"] = "cached"
        return item, False

    summary = strip_summary_urls(text[:480])
    method = "raw"
    skip_grok = os.environ.get("SKIP_GROK", "0") == "1"
    if not skip_grok:
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
        "role": role,
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
            s.get("role", "authority"),
        )
        items.append(item)
        if changed:
            any_changed = True
    return items, any_changed


def main():
    load_dotenv()
    force = os.environ.get("FORCE_RESCRAPE", os.environ.get("FORCE_RESCrape", "0")) == "1"
    role_filter = (os.environ.get("TWITTER_ROLE_FILTER") or "all").strip().lower()
    if role_filter not in ("all", "authority", "journalist"):
        role_filter = "all"

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

    accounts = list(twitter_cfg.get("accounts", []))
    if role_filter != "all":
        accounts = [a for a in accounts if (a.get("role") or "authority") == role_filter]
        print(f"TWITTER_ROLE_FILTER={role_filter} → {len(accounts)} accounts", file=sys.stderr)

    if bearer and twitter_enabled:
        payment_blocked = False
        for acct in accounts:
            if payment_blocked:
                break
            handle = acct["handle"]
            priority = acct.get("priority", "related")
            role = acct.get("role", "authority")
            # Cap window — keep CI under rate/credit budgets
            max_results = 40
            try:
                tweets = fetch_user_tweets(
                    handle,
                    bearer,
                    keywords=keywords,
                    exclude=exclude,
                    priority=priority,
                    max_results=max_results,
                    cache=cache,
                )
            except Exception as e:
                msg = str(e)
                print(f"@{handle}: {msg}", file=sys.stderr)
                if "402" in msg or "Payment Required" in msg:
                    print(
                        "X/Twitter API returned 402 Payment Required — "
                        "plan/credits exhausted for this endpoint. Keeping prior bulletin + manual seeds.",
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
                    None,
                    role,
                )
                items.append(item)
                if changed:
                    any_changed = True
        if not live_ok:
            print("No live tweets fetched — using manual seeds", file=sys.stderr)
    else:
        print("Twitter API not configured — using manual seeds only", file=sys.stderr)

    manual, manual_changed = load_manual_seeds(cache, force)
    if role_filter != "all":
        manual = [m for m in manual if (m.get("role") or "authority") == role_filter]
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

    # Role-filtered runs merge into existing bulletin so authority posts aren't wiped
    if role_filter != "all" and TWITTER_BULLETIN.exists():
        existing = json.loads(TWITTER_BULLETIN.read_text(encoding="utf-8"))
        kept = [
            it
            for it in (existing.get("items") or [])
            if (it.get("role") or "authority") != role_filter
        ]
        merged = {it["id"]: it for it in kept}
        for it in deduped:
            merged[it["id"]] = it
        deduped = list(merged.values())
        print(
            f"Merged {role_filter} scrape into existing bulletin ({len(deduped)} total)",
            file=sys.stderr,
        )

    deduped.sort(key=lambda x: x.get("timestamp", ""), reverse=True)

    # When live API fails, keep previously scraped tweets — don't replace with manual seeds only
    if not live_ok and role_filter == "all" and TWITTER_BULLETIN.exists():
        existing = json.loads(TWITTER_BULLETIN.read_text(encoding="utf-8"))
        merged = {it["id"]: it for it in (existing.get("items") or []) if it.get("scrapeMethod") != "manual"}
        for it in deduped:
            merged[it["id"]] = it
        deduped = list(merged.values())
        print(
            f"Live fetch off — merged manual seeds into existing bulletin ({len(deduped)} total)",
            file=sys.stderr,
        )

    grok_on = bool(
        sanitize_bearer(os.environ.get("XAI_API_KEY"))
        or sanitize_bearer(os.environ.get("X_AI"))
        or sanitize_bearer(os.environ.get("GROK_API_KEY"))
    ) and os.environ.get("SKIP_GROK", "0") != "1"

    note = (
        "Authority and journalist Twitter/X posts — summarized with link. Verify on original; not official confirmation."
        if live_ok
        else "Curated X post summaries (live API unavailable or unpaid). Follow accounts below for newest posts."
    )

    if not any_changed and TWITTER_BULLETIN.exists() and not force and role_filter == "all":
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
    jn = sum(1 for i in deduped if i.get("role") == "journalist")
    print(
        f"Wrote {len(deduped)} Twitter bulletin items (live={live_ok}, journalists={jn})",
        file=sys.stderr,
    )


if __name__ == "__main__":
    main()
