#!/usr/bin/env python3
"""
Scrape MoFA flash flood category → data/bulletin.json

Smart skip (NOT a full agent — just hash diff):
  - Fetches https://mofa.gov.np/category/flashflood/
  - For each article: hash body → if unchanged, reuse cached summary (no Grok call)
  - If nothing new/changed: skip rewriting bulletin.json

Grok (optional): set XAI_API_KEY in .env or environment
  - Only called when content hash changes OR new URL appears
  - Fallback: rule-based excerpt (no API, no cloud required)

Cron:
  */30 * * * * cd /path/to/project && ./scripts/refresh.sh
"""

from __future__ import annotations

import hashlib
import json
import os
import re
import subprocess
import sys
import urllib.request
from datetime import datetime, timezone
from html import unescape
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data"
BULLETIN_PATH = DATA / "bulletin.json"
SOURCES_PATH = DATA / "sources.json"
CACHE_PATH = DATA / "scraped" / "content_cache.json"
SCRAPED_DIR = DATA / "scraped"
ENV_PATH = ROOT / ".env"

USER_AGENT = "Mozilla/5.0 (compatible; NepalFloodHelp/1.0; +volunteer)"


from grok_client import grok_summarize_official, load_dotenv as _load_dotenv


def load_dotenv():
    _load_dotenv()


def discover_mofa_urls(category_html: str, base_url: str) -> list[str]:
    """Discover flood article URLs from MoFA flashflood category page."""
    base = base_url.rstrip("/")
    flood_ids = {"1862", "1863", "1864", "1865"}
    urls = []
    for path in re.findall(r'href="(/content/\d+/[^"]+)"', category_html):
        pl = path.lower()
        cid = re.search(r"/content/(\d+)/", path)
        content_id = cid.group(1) if cid else ""
        if content_id in flood_ids:
            urls.append(base + path)
            continue
        if any(k in pl for k in ("flash-flood", "flash-floods", "flashflood", "bhotekoshi", "bhote-koshi")):
            urls.append(base + path)
            continue
        if "emergency-control" in pl or "emergency-response" in pl or "ecr--" in pl:
            urls.append(base + path)
    return list(dict.fromkeys(urls))


def fetch_url(url: str) -> str:
    try:
        r = subprocess.run(
            ["curl", "-sL", url, "-H", f"User-Agent: {USER_AGENT}"],
            capture_output=True,
            text=True,
            timeout=60,
        )
        if r.returncode == 0 and r.stdout:
            return r.stdout
    except Exception:
        pass
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(req, timeout=60) as resp:
        return resp.read().decode("utf-8", errors="replace")


def clean_text(html_fragment: str) -> str:
    t = unescape(re.sub(r"<[^>]+>", " ", html_fragment))
    t = t.replace("\xa0", " ")
    return re.sub(r"\s+", " ", t).strip()


def content_hash(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()[:16]


def slug_id(url: str) -> str:
    return hashlib.sha256(url.encode()).hexdigest()[:12]


def load_cache() -> dict:
    if CACHE_PATH.exists():
        return json.loads(CACHE_PATH.read_text(encoding="utf-8"))
    return {}


def save_cache(cache: dict):
    CACHE_PATH.parent.mkdir(parents=True, exist_ok=True)
    CACHE_PATH.write_text(json.dumps(cache, ensure_ascii=False, indent=2), encoding="utf-8")


def parse_mofa_date(html: str) -> str:
    for pat in [
        r"(August \d+, 2026[^<]{0,40})",
        r"(Updated at [^<]{5,80})",
    ]:
        m = re.search(pat, html, re.I)
        if m:
            return clean_text(m.group(1))
    return ""


def parse_mofa_title(html: str) -> str:
    m = re.search(r"<h1[^>]*>(.*?)</h1>", html, re.DOTALL | re.I)
    if m:
        return clean_text(m.group(1))
    m = re.search(r"<title>(.*?)</title>", html, re.I)
    return clean_text(m.group(1)).split("|")[0].strip() if m else "MoFA update"


def extract_mofa_body(html: str) -> list[str]:
    start = html.find("<h1")
    if start < 0:
        start = 0
    end = html.find("Related news", start)
    if end < 0:
        end = start + 120000
    chunk = html[start:end]

    parts: list[str] = []
    seen = set()
    for tag in ("p", "li", "td", "h2", "h3", "strong"):
        for m in re.finditer(rf"<{tag}[^>]*>(.*?)</{tag}>", chunk, re.DOTALL | re.I):
            t = clean_text(m.group(1))
            if len(t) < 25:
                continue
            if any(x in t for x in ("var(--", "display:", "function ", "@media")):
                continue
            if t in seen:
                continue
            seen.add(t)
            parts.append(t)
    return parts


def summarize_rule_based(title: str, paragraphs: list[str]) -> str:
    if not paragraphs:
        return title
    stat_re = re.compile(
        r"\b(\d+)\s+(bodies|missing|found|people|recovered|rescued|countries)\b",
        re.I,
    )
    priority, rest = [], []
    for p in paragraphs:
        if stat_re.search(p) or "hotline" in p.lower() or "whatsapp" in p.lower():
            priority.append(p)
        else:
            rest.append(p)
    chosen = (priority[:2] if priority else rest[:2]) or paragraphs[:2]
    summary = " ".join(chosen)
    if len(summary) > 480:
        summary = summary[:477].rsplit(" ", 1)[0] + "…"
    return summary


def infer_timestamp(date_str: str, title: str) -> str:
    for day, ts in [
        ("28", "2026-08-28T17:00:00+05:45"),
        ("27", "2026-08-27T17:00:00+05:45"),
        ("26", "2026-08-26T17:00:00+05:45"),
    ]:
        if f"August {day}, 2026" in date_str or f"August {day}" in title:
            return ts
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def scrape_mofa_article(url: str, regions: list[str], cache: dict, force: bool) -> tuple[dict | None, bool]:
    """
    Returns (bulletin_item, changed).
    Skips Grok if content hash unchanged.
    """
    print(f"Fetching: {url}", file=sys.stderr)
    html = fetch_url(url)
    if not html or len(html) < 500:
        return None, False

    title = parse_mofa_title(html)
    date_str = parse_mofa_date(html)
    paragraphs = extract_mofa_body(html)
    body = "\n\n".join(paragraphs)
    ch = content_hash(body)

    cached = cache.get(url, {})
    unchanged = cached.get("contentHash") == ch and not force

    if unchanged and cached.get("item"):
        print(f"  unchanged — skip Grok", file=sys.stderr)
        item = dict(cached["item"])
        item["scrapeMethod"] = "cached"
        return item, False

    print(f"  NEW or CHANGED — summarizing", file=sys.stderr)
    summary = summarize_rule_based(title, paragraphs)
    summary_method = "rule-based"

    ai = grok_summarize_official(title, body, url)
    if ai:
        summary = ai
        summary_method = "grok"

    item = {
        "id": f"mofa-{slug_id(url)}",
        "timestamp": infer_timestamp(date_str, title),
        "publishedLabel": date_str,
        "region": regions,
        "source": "Nepal Ministry of Foreign Affairs",
        "sourceUrl": url,
        "title": title,
        "summary": summary,
        "citation": f"MoFA — {title}",
        "scrapeMethod": summary_method,
        "contentHash": ch,
    }

    cache[url] = {
        "contentHash": ch,
        "fetchedAt": datetime.now(timezone.utc).isoformat(),
        "item": {k: v for k, v in item.items() if k != "scrapeMethod"},
    }
    return item, True


def scrape_all() -> tuple[dict, bool]:
    """Returns (bulletin, any_changes)."""
    load_dotenv()
    force = os.environ.get("FORCE_RESCRAPE", os.environ.get("FORCE_RESCrape", "0")) == "1"
    sources = json.loads(SOURCES_PATH.read_text(encoding="utf-8"))
    cache = load_cache()
    items: list[dict] = []
    any_changed = False

    if not sources.get("mofa", {}).get("enabled", True):
        print("MoFA scraping disabled", file=sys.stderr)
    else:
        cat_url = sources["mofa"]["categoryUrl"]
        base = sources["mofa"]["baseUrl"]
        regions = sources["mofa"]["region"]

        cat_html = fetch_url(cat_url)
        urls = discover_mofa_urls(cat_html, base)
        print(f"Discovered {len(urls)} URLs from {cat_url}", file=sys.stderr)

        for url in urls:
            try:
                item, changed = scrape_mofa_article(url, regions, cache, force)
                if item:
                    items.append(item)
                    if changed:
                        any_changed = True
            except Exception as e:
                print(f"Failed {url}: {e}", file=sys.stderr)

    save_cache(cache)

    # Dedupe by URL / title
    seen_urls, seen_titles, deduped = set(), set(), []
    for it in items:
        u = it["sourceUrl"]
        tk = re.sub(r"\s+", " ", it.get("title", "").lower())[:80]
        if u in seen_urls or tk in seen_titles:
            continue
        seen_urls.add(u)
        seen_titles.add(tk)
        deduped.append(it)

    deduped.sort(key=lambda x: x.get("timestamp", ""), reverse=True)

    grok_on = bool(os.environ.get("XAI_API_KEY") or os.environ.get("GROK_API_KEY"))
    bulletin = {
        "generatedAt": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        "note": "Auto-scraped from MoFA flashflood category. Summaries are excerpts — read the cited source.",
        "summarizer": "grok" if grok_on else "rule-based",
        "skippedUnchanged": not any_changed and not force,
        "items": deduped,
    }

    SCRAPED_DIR.mkdir(parents=True, exist_ok=True)
    (SCRAPED_DIR / "last_run.json").write_text(
        json.dumps(
            {
                "at": bulletin["generatedAt"],
                "urls": len(deduped),
                "changed": any_changed,
                "grok": grok_on,
            },
            indent=2,
        ),
        encoding="utf-8",
    )

    return bulletin, any_changed or force


def main():
    bulletin, changed = scrape_all()

    if not changed and BULLETIN_PATH.exists():
        # Update timestamp only in last_run; keep bulletin file stable
        existing = json.loads(BULLETIN_PATH.read_text(encoding="utf-8"))
        existing["generatedAt"] = bulletin["generatedAt"]
        existing["skippedUnchanged"] = True
        existing["summarizer"] = bulletin["summarizer"]
        BULLETIN_PATH.write_text(json.dumps(existing, ensure_ascii=False, indent=2), encoding="utf-8")
        print(f"No content changes — bulletin unchanged ({len(existing.get('items', []))} items)", file=sys.stderr)
        return

    BULLETIN_PATH.write_text(json.dumps(bulletin, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Wrote {len(bulletin['items'])} items (changed={changed})", file=sys.stderr)


if __name__ == "__main__":
    main()
