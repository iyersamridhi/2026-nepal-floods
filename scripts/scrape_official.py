#!/usr/bin/env python3
"""
Scrape configured official sources → data/bulletin.json

Sources are listed in data/sources.json → officialSources[].
Types:
  - category: discover article URLs from a listing page (MoFA)
  - url: fetch a single static HTML page (MEA, Xinhua, …)
  - seed: curated JSON pointer / fallback (NDRRMA portal, Nepal Police UDB, …)

Smart skip (NOT a full agent — hash diff only):
  - Hash body text → if unchanged, reuse cached summary (no Grok call)
  - Grok (optional): only when content hash changes or URL is new

Cron / GitHub Actions:
  ./scripts/refresh.sh
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

from grok_client import grok_summarize_official, load_dotenv as _load_dotenv

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data"
BULLETIN_PATH = DATA / "bulletin.json"
SOURCES_PATH = DATA / "sources.json"
CACHE_PATH = DATA / "scraped" / "content_cache.json"
SCRAPED_DIR = DATA / "scraped"

USER_AGENT = "Mozilla/5.0 (compatible; NepalFloodHelp/1.0; +volunteer)"


def load_dotenv():
    _load_dotenv()


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


def summarize_rule_based(title: str, paragraphs: list[str]) -> str:
    if not paragraphs:
        return title
    stat_re = re.compile(
        r"\b(\d+)\s+(bodies|missing|found|people|recovered|rescued|countries)\b",
        re.I,
    )
    priority, rest = [], []
    for p in paragraphs:
        pl = p.lower()
        if stat_re.search(p) or "hotline" in pl or "whatsapp" in pl or "control room" in pl:
            priority.append(p)
        else:
            rest.append(p)
    chosen = (priority[:2] if priority else rest[:2]) or paragraphs[:2]
    summary = " ".join(chosen)
    if len(summary) > 480:
        summary = summary[:477].rsplit(" ", 1)[0] + "…"
    return summary


def infer_timestamp(date_str: str, title: str, fallback: str = "") -> str:
    if fallback:
        return fallback
    for day, ts in [
        ("28", "2026-08-28T17:00:00+05:45"),
        ("27", "2026-08-27T17:00:00+05:45"),
        ("26", "2026-08-26T17:00:00+05:45"),
    ]:
        if f"August {day}, 2026" in date_str or f"August {day}" in title or f"Aug. {day}" in date_str:
            return ts
    iso = re.search(r"(\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2})", date_str)
    if iso:
        return iso.group(1).replace(" ", "T") + "+05:45"
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def parse_title(html: str) -> str:
    h1 = ""
    m = re.search(r"<h1[^>]*>(.*?)</h1>", html, re.DOTALL | re.I)
    if m:
        h1 = clean_text(m.group(1))
    m = re.search(r"<title>(.*?)</title>", html, re.I)
    title_tag = clean_text(m.group(1)).split("|")[0].strip() if m else ""

    generic = {"media releases", "press releases", "official update", "home", "publications"}
    if h1 and h1.lower() not in generic and len(h1) > 15:
        return h1
    if title_tag and title_tag.lower() not in generic:
        return title_tag
    return h1 or title_tag or "Official update"


def parse_date(html: str) -> str:
    for pat in [
        r"(August \d+, 2026[^<]{0,40})",
        r"(Updated at [^<]{5,80})",
        r'class="time"[^>]*>([^<]+)',
        r'data-pbtime="([^"]+)"',
        r"(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2})",
    ]:
        m = re.search(pat, html, re.I)
        if m:
            return clean_text(m.group(1))
    return ""


def extract_body_paragraphs(html: str) -> list[str]:
    start = html.find("<h1")
    if start < 0:
        start = 0
    end_candidates = [
        html.find("Related news", start),
        html.find('id="comments"', start),
        html.find("Comments (0)", start),
        html.find('class="comments"', start),
    ]
    end = min([x for x in end_candidates if x > 0], default=start + 120000)

    chunk = html[start:end]
    parts: list[str] = []
    seen = set()
    for tag in ("p", "li", "td", "h2", "h3", "strong"):
        for m in re.finditer(rf"<{tag}[^>]*>(.*?)</{tag}>", chunk, re.DOTALL | re.I):
            t = clean_text(m.group(1))
            if len(t) < 25:
                continue
            if any(x in t for x in ("var(--", "display:", "function ", "@media", "Comments (0)")):
                continue
            if t in seen:
                continue
            seen.add(t)
            parts.append(t)
    return parts


def build_item(
    *,
    item_id: str,
    url: str,
    title: str,
    source_name: str,
    regions: list[str],
    summary: str,
    summary_method: str,
    ch: str,
    date_str: str = "",
    timestamp: str = "",
    citation: str = "",
) -> dict:
    return {
        "id": item_id,
        "timestamp": infer_timestamp(date_str, title, timestamp),
        "publishedLabel": date_str,
        "region": regions,
        "source": source_name,
        "sourceUrl": url,
        "title": title,
        "summary": summary,
        "citation": citation or f"{source_name} — {title}",
        "scrapeMethod": summary_method,
        "contentHash": ch,
    }


def summarize_content(title: str, body: str, url: str, paragraphs: list[str]) -> tuple[str, str]:
    summary = summarize_rule_based(title, paragraphs)
    method = "rule-based"
    ai = grok_summarize_official(title, body, url)
    if ai:
        summary = ai
        method = "grok"
    return summary, method


def scrape_from_body(
    *,
    cache_key: str,
    url: str,
    title: str,
    source_name: str,
    regions: list[str],
    item_id: str,
    body: str,
    paragraphs: list[str],
    cache: dict,
    force: bool,
    date_str: str = "",
    timestamp: str = "",
    citation: str = "",
) -> tuple[dict | None, bool]:
    ch = content_hash(body)
    cached = cache.get(cache_key, {})
    unchanged = cached.get("contentHash") == ch and not force

    if unchanged and cached.get("item"):
        print(f"  unchanged — skip Grok ({cache_key})", file=sys.stderr)
        item = dict(cached["item"])
        item["scrapeMethod"] = "cached"
        return item, False

    print(f"  NEW or CHANGED — summarizing ({cache_key})", file=sys.stderr)
    summary, method = summarize_content(title, body, url, paragraphs)
    item = build_item(
        item_id=item_id,
        url=url,
        title=title,
        source_name=source_name,
        regions=regions,
        summary=summary,
        summary_method=method,
        ch=ch,
        date_str=date_str,
        timestamp=timestamp,
        citation=citation,
    )
    cache[cache_key] = {
        "contentHash": ch,
        "fetchedAt": datetime.now(timezone.utc).isoformat(),
        "item": {k: v for k, v in item.items() if k != "scrapeMethod"},
    }
    return item, True


def scrape_html_page(
    url: str,
    source_name: str,
    regions: list[str],
    prefix: str,
    cache: dict,
    force: bool,
) -> tuple[dict | None, bool]:
    print(f"Fetching: {url}", file=sys.stderr)
    html = fetch_url(url)
    if not html or len(html) < 500:
        print(f"  fetch failed or too short", file=sys.stderr)
        return None, False

    title = parse_title(html)
    date_str = parse_date(html)
    paragraphs = extract_body_paragraphs(html)
    body = "\n\n".join(paragraphs)
    if len(body) < 80:
        print(f"  insufficient body text", file=sys.stderr)
        return None, False

    return scrape_from_body(
        cache_key=url,
        url=url,
        title=title,
        source_name=source_name,
        regions=regions,
        item_id=f"{prefix}-{slug_id(url)}",
        body=body,
        paragraphs=paragraphs,
        cache=cache,
        force=force,
        date_str=date_str,
    )


def load_seed(path: Path) -> dict | None:
    if not path.exists():
        return None
    data = json.loads(path.read_text(encoding="utf-8"))
    if isinstance(data, list):
        return data[0] if data else None
    return data


def scrape_seed(source_cfg: dict, cache: dict, force: bool) -> tuple[dict | None, bool]:
    seed_path = ROOT / source_cfg["seedFile"]
    seed = load_seed(seed_path)
    if not seed:
        print(f"Seed missing: {seed_path}", file=sys.stderr)
        return None, False

    url = seed.get("sourceUrl") or seed.get("url") or ""
    title = seed.get("title") or source_cfg.get("name", "Official update")
    body = seed.get("body") or seed.get("text") or title
    paragraphs = [p.strip() for p in re.split(r"\n+", body) if p.strip()]
    source_name = seed.get("source") or source_cfg.get("name", "Official source")
    regions = seed.get("region") or source_cfg.get("region", ["nepal"])
    cache_key = f"seed:{source_cfg['id']}:{url or seed_path.name}"

    return scrape_from_body(
        cache_key=cache_key,
        url=url,
        title=title,
        source_name=source_name,
        regions=regions,
        item_id=seed.get("id") or f"seed-{source_cfg['id']}",
        body=body,
        paragraphs=paragraphs,
        cache=cache,
        force=force,
        timestamp=seed.get("timestamp", ""),
        citation=seed.get("citation", ""),
    )


def discover_mofa_urls(category_html: str, base_url: str) -> list[str]:
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


def scrape_mofa_category(source_cfg: dict, cache: dict, force: bool) -> tuple[list[dict], bool]:
    items: list[dict] = []
    any_changed = False
    cat_url = source_cfg["categoryUrl"]
    base = source_cfg["baseUrl"]
    regions = source_cfg.get("region", ["nepal"])
    source_name = source_cfg.get("name", "Nepal Ministry of Foreign Affairs")

    cat_html = fetch_url(cat_url)
    urls = discover_mofa_urls(cat_html, base)
    print(f"MoFA: discovered {len(urls)} URLs from {cat_url}", file=sys.stderr)

    for url in urls:
        try:
            item, changed = scrape_html_page(url, source_name, regions, "mofa", cache, force)
            if item:
                items.append(item)
                if changed:
                    any_changed = True
        except Exception as e:
            print(f"Failed {url}: {e}", file=sys.stderr)
    return items, any_changed


def scrape_url_source(source_cfg: dict, cache: dict, force: bool) -> tuple[list[dict], bool]:
    url = source_cfg["url"]
    source_name = source_cfg.get("name", "Official source")
    regions = source_cfg.get("region", ["nepal"])
    prefix = source_cfg.get("id", "official")

    try:
        item, changed = scrape_html_page(url, source_name, regions, prefix, cache, force)
    except Exception as e:
        print(f"Failed {url}: {e}", file=sys.stderr)
        item, changed = None, False

    if item:
        return [item], changed

    if source_cfg.get("seedFallback") and source_cfg.get("seedFile"):
        print(f"  falling back to seed for {source_cfg['id']}", file=sys.stderr)
        seed_item, seed_changed = scrape_seed(source_cfg, cache, force)
        if seed_item:
            return [seed_item], seed_changed
    return [], False


def dedupe_items(items: list[dict]) -> list[dict]:
    seen_urls, seen_titles, deduped = set(), set(), []
    for it in items:
        u = it.get("sourceUrl", "")
        tk = re.sub(r"\s+", " ", it.get("title", "").lower())[:80]
        if u in seen_urls or (tk and tk in seen_titles):
            continue
        if u:
            seen_urls.add(u)
        if tk:
            seen_titles.add(tk)
        deduped.append(it)
    deduped.sort(key=lambda x: x.get("timestamp", ""), reverse=True)
    return deduped


def scrape_all() -> tuple[dict, bool]:
    load_dotenv()
    force = os.environ.get("FORCE_RESCRAPE", os.environ.get("FORCE_RESCrape", "0")) == "1"
    sources = json.loads(SOURCES_PATH.read_text(encoding="utf-8"))
    cache = load_cache()
    items: list[dict] = []
    any_changed = False
    source_names: list[str] = []

    for source_cfg in sources.get("officialSources", []):
        if not source_cfg.get("enabled", True):
            print(f"Skipping disabled source: {source_cfg.get('id')}", file=sys.stderr)
            continue

        stype = source_cfg.get("type", "url")
        sid = source_cfg.get("id", stype)
        print(f"Source: {sid} ({stype})", file=sys.stderr)
        source_names.append(source_cfg.get("name", sid))

        try:
            if stype == "category":
                batch, changed = scrape_mofa_category(source_cfg, cache, force)
            elif stype == "url":
                batch, changed = scrape_url_source(source_cfg, cache, force)
            elif stype == "seed":
                item, changed = scrape_seed(source_cfg, cache, force)
                batch = [item] if item else []
            else:
                print(f"Unknown source type: {stype}", file=sys.stderr)
                continue

            items.extend(batch)
            if changed:
                any_changed = True
        except Exception as e:
            print(f"Source {sid} failed: {e}", file=sys.stderr)

    save_cache(cache)
    deduped = dedupe_items(items)

    grok_on = bool(os.environ.get("XAI_API_KEY") or os.environ.get("GROK_API_KEY"))
    enabled_count = sum(1 for s in sources.get("officialSources", []) if s.get("enabled", True))
    bulletin = {
        "generatedAt": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        "note": (
            f"Auto-scraped from {enabled_count} configured official sources "
            f"(MoFA, MEA, Xinhua, curated seeds). Summaries are excerpts — read the cited source."
        ),
        "sources": source_names,
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
                "sources": [s.get("id") for s in sources.get("officialSources", []) if s.get("enabled", True)],
            },
            indent=2,
        ),
        encoding="utf-8",
    )

    return bulletin, any_changed or force


def main():
    bulletin, changed = scrape_all()

    if not changed and BULLETIN_PATH.exists():
        existing = json.loads(BULLETIN_PATH.read_text(encoding="utf-8"))
        existing["generatedAt"] = bulletin["generatedAt"]
        existing["skippedUnchanged"] = True
        existing["summarizer"] = bulletin["summarizer"]
        existing["sources"] = bulletin.get("sources", [])
        BULLETIN_PATH.write_text(json.dumps(existing, ensure_ascii=False, indent=2), encoding="utf-8")
        print(f"No content changes — bulletin unchanged ({len(existing.get('items', []))} items)", file=sys.stderr)
        return

    BULLETIN_PATH.write_text(json.dumps(bulletin, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Wrote {len(bulletin['items'])} items (changed={changed})", file=sys.stderr)


if __name__ == "__main__":
    main()
