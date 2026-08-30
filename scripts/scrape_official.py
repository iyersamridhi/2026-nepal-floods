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

from grok_client import grok_summarize_official, load_dotenv as _load_dotenv, strip_summary_urls

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
    """Return ISO-8601 with Nepal offset (+05:45) when possible."""
    blob = f"{date_str} {title}"

    m = re.search(
        r"(January|February|March|April|May|June|July|August|September|October|November|December)"
        r"\s+(\d{1,2}),?\s+(\d{4})(?:,?\s+(\d{1,2}):(\d{2})\s*(AM|PM))?",
        blob,
        re.I,
    )
    if m:
        months = {
            "january": 1, "february": 2, "march": 3, "april": 4, "may": 5, "june": 6,
            "july": 7, "august": 8, "september": 9, "october": 10, "november": 11, "december": 12,
        }
        month = months[m.group(1).lower()]
        day = int(m.group(2))
        year = int(m.group(3))
        if m.group(4):
            hour = int(m.group(4))
            minute = int(m.group(5))
            ap = m.group(6).upper()
            if ap == "PM" and hour < 12:
                hour += 12
            if ap == "AM" and hour == 12:
                hour = 0
        else:
            hour, minute = 12, 0
        return f"{year:04d}-{month:02d}-{day:02d}T{hour:02d}:{minute:02d}:00+05:45"

    iso = re.search(r"(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}:\d{2})", date_str or "")
    if iso:
        return f"{iso.group(1)}T{iso.group(2)}+05:45"

    if fallback:
        return normalize_iso(fallback)

    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def normalize_iso(ts: str) -> str:
    if not ts:
        return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
    s = ts.strip().replace(" ", "T")
    if re.match(r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$", s):
        s += ":00"
    if re.match(r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$", s):
        s += "+05:45"
    return s


def published_label(iso: str) -> str:
    """Consistent display: 29 Aug 2026 · 3:00 pm (Nepal time)."""
    try:
        s = normalize_iso(iso)
        m = re.match(
            r"(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?(?:\.\d+)?(Z|[+-]\d{2}:\d{2})?",
            s,
        )
        if not m:
            return iso
        year, month, day = int(m.group(1)), int(m.group(2)), int(m.group(3))
        hour, minute = int(m.group(4)), int(m.group(5))
        offset = m.group(7) or ""
        # Convert UTC → Nepal (+05:45)
        if offset in ("Z", "+00:00"):
            total = hour * 60 + minute + 5 * 60 + 45
            extra_days, total = divmod(total, 24 * 60)
            day += extra_days
            hour, minute = divmod(total, 60)
        months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
        # naive month overflow for end-of-month UTC conversion
        while month <= 12 and day > 31:
            day -= 31
            month += 1
        ap = "am" if hour < 12 else "pm"
        h12 = hour % 12 or 12
        return f"{day} {months[month - 1]} {year} · {h12}:{minute:02d} {ap}"
    except Exception:
        return iso


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
        ts = normalize_iso(it.get("timestamp", ""))
        it["timestamp"] = ts
        it["publishedLabel"] = published_label(ts)
        deduped.append(it)
    updates = sorted(
        [i for i in deduped if i.get("kind") != "pointer"],
        key=lambda x: x.get("timestamp", ""),
        reverse=True,
    )
    pointers = sorted(
        [i for i in deduped if i.get("kind") == "pointer"],
        key=lambda x: x.get("timestamp", ""),
        reverse=True,
    )
    return updates + pointers


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
    # Prefer list items (MoFA briefings put key facts in <li>/<span>), then paragraphs
    for tag in ("li", "p", "td", "h2", "h3", "strong", "span"):
        for m in re.finditer(rf"<{tag}[^>]*>(.*?)</{tag}>", chunk, re.DOTALL | re.I):
            inner = m.group(1)
            # Skip containers that still nest block tags (avoid huge duplicate blobs)
            if tag == "span" and re.search(r"<(?:p|li|div|ul)\b", inner, re.I):
                continue
            t = clean_text(inner)
            if len(t) < 40:
                continue
            if any(x in t for x in ("var(--", "display:", "function ", "@media", "Comments (0)")):
                continue
            if len(t) > 1200:
                t = t[:1197].rsplit(" ", 1)[0] + "…"
            if t in seen:
                continue
            # Skip near-duplicates (span often mirrors li)
            if any(t in s or s in t for s in seen if abs(len(s) - len(t)) < 40):
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
    kind: str = "update",
) -> dict:
    ts = infer_timestamp(date_str, title, timestamp)
    return {
        "id": item_id,
        "timestamp": ts,
        "publishedLabel": published_label(ts),
        "region": regions,
        "source": source_name,
        "sourceUrl": url,
        "title": title,
        "summary": summary,
        "citation": citation or f"{source_name} — {title}",
        "kind": kind,
        "scrapeMethod": summary_method,
        "contentHash": ch,
    }


def summarize_content(title: str, body: str, url: str, paragraphs: list[str]) -> tuple[str, str]:
    summary = strip_summary_urls(summarize_rule_based(title, paragraphs))
    method = "rule-based"
    ai = grok_summarize_official(title, body, url)
    if ai:
        summary = strip_summary_urls(ai)
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
    kind: str = "update",
) -> tuple[dict | None, bool]:
    ch = content_hash(body)
    cached = cache.get(cache_key, {})
    unchanged = cached.get("contentHash") == ch and not force

    if unchanged and cached.get("item"):
        print(f"  unchanged — skip Grok ({cache_key})", file=sys.stderr)
        item = dict(cached["item"])
        item["summary"] = strip_summary_urls(item.get("summary", ""))
        item["scrapeMethod"] = "cached"
        item.setdefault("kind", kind)
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
        kind=kind,
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
    timestamp_fallback: str = "",
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
        timestamp=timestamp_fallback,
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
        kind=seed.get("kind") or "pointer",
    )


def discover_mofa_urls(category_html: str, base_url: str) -> list[str]:
    """Discover flood articles from MoFA flashflood category.

    Match by content id, URL slug, or visible link text (so press briefings
    like /content/1866/press-briefing-note-… are not missed).
    """
    base = base_url.rstrip("/")
    known_ids = {"1862", "1863", "1864", "1865", "1866"}
    slug_keys = (
        "flash-flood",
        "flash-floods",
        "flashflood",
        "bhotekoshi",
        "bhote-koshi",
        "emergency-control",
        "emergency-response",
        "ecr--",
        "press-briefing",
    )
    text_keys = (
        "flash flood",
        "bhote koshi",
        "bhotekoshi",
        "rasuwa",
        "press briefing",
        "emergency control",
        "missing",
        "rescued",
    )
    urls: list[str] = []

    for m in re.finditer(
        r'<a[^>]+href="(/content/\d+/[^"]+)"[^>]*>(.*?)</a>',
        category_html,
        re.I | re.S,
    ):
        path, inner = m.group(1), m.group(2)
        pl = path.lower()
        text = clean_text(inner).lower()
        cid = re.search(r"/content/(\d+)/", path)
        content_id = cid.group(1) if cid else ""

        if content_id in known_ids:
            urls.append(base + path)
            continue
        if any(k in pl for k in slug_keys):
            urls.append(base + path)
            continue
        if any(k in text for k in text_keys):
            urls.append(base + path)

    # Fallback: bare href scan if anchor regex missed lazy markup
    if not urls:
        for path in re.findall(r'href="(/content/\d+/[^"]+)"', category_html):
            pl = path.lower()
            cid = re.search(r"/content/(\d+)/", path)
            content_id = cid.group(1) if cid else ""
            if content_id in known_ids or any(k in pl for k in slug_keys):
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
    ts_fallback = ""
    if source_cfg.get("seedFile"):
        seed = load_seed(ROOT / source_cfg["seedFile"])
        if seed:
            ts_fallback = seed.get("timestamp", "")

    try:
        item, changed = scrape_html_page(
            url, source_name, regions, prefix, cache, force, timestamp_fallback=ts_fallback
        )
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
