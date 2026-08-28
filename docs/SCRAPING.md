# Scraping & summarization architecture

## Do you need an agent?

**No.** A hash-diff cron is enough:

```
Every 30 min:
  1. Fetch mofa.gov.np/category/flashflood/
  2. For each article URL → fetch page → hash body text
  3. If hash == cached → skip (no Grok call, no bulletin change)
  4. If new URL or hash changed → summarize → update bulletin
  5. If nothing changed → skip rewriting items
```

This is deterministic, cheap, and safe. A full "agent" only makes sense if you add Twitter + 10 sources + conflict resolution later.

## Primary source (auto)

| Source | URL | Why |
|--------|-----|-----|
| **MoFA flash flood category** | https://mofa.gov.np/category/flashflood/ | Daily updates, foreign national stats, ECR helplines |

Scraper discovers all articles from the category page — no manual URL hunting.

## Not auto-scraped (link only)

| Source | Why |
|--------|-----|
| **India MEA** | JS-rendered site. Helplines on Resources page. Update `data/seeds/mea_control_room.json` manually if new communique. |
| **NDRRMA / SETU** | Mostly JS apps — we link, don't scrape |
| **Nepal Police UDB** | Don't republish photos — redirect to official found/missing pages |

## Other sources worth adding later

- **Nepali Embassy Beijing** notice (Tibet side) — when new URL posted
- **Xinhua / China Daily** Gyirong coverage — static URL, hash diff works
- **District CDO Facebook pages** — need manual curation or Graph API

## Summarization: how it works

| Mode | When | Cost |
|------|------|------|
| **Rule-based** (default) | Always, as fallback | Free, runs locally |
| **Grok (xAI)** | When `XAI_API_KEY` set AND content changed | ~$0.001 per changed article |

### Do you need OpenRouter?

**No for v1.** Rule-based handles unchanged runs. Grok via xAI direct is enough for quality summaries on changed MoFA pages.

OpenRouter only helps if you want to swap models (Claude, GPT) without xAI account — optional later.

### Do you need cloud?

**No for scraping.** Cron on your laptop works.

**Yes for 24/7 public site:** deploy static site to Netlify + GitHub Action cron to run `scrape_official.py` and commit `bulletin.json` (or use a tiny VPS cron).

## Grok setup

```bash
cp .env.example .env
# Add key from https://console.x.ai/
python3 scripts/test_grok.py
python3 scripts/scrape_official.py
```

Grok is called **only when article content hash changes** — not every cron tick.

## Twitter + Grok (phase 2)

**Accounts to monitor** (in `data/sources.json`):

- @NDRRMA_Nepal, @NepalPoliceHQ, @MoFANepal
- @MEAIndia, @IndiainNepal
- @NepalArmyHQ, @USEmbassyNepal, @NepalTourismBoard

**Keywords:** bhotekoshi, rasuwa, gyirong, trishuli, flash flood, missing, rescued, kailash

**Requires:** `TWITTER_BEARER_TOKEN` (X API paid tier). Grok then summarizes **new** tweets only.

Without Twitter API: use Grok manually in X to scan those handles, paste into `data/seeds/twitter_manual.json`.

## Cron

```bash
*/30 * * * * cd /path/to/project && ./scripts/refresh.sh >> /tmp/nfh.log 2>&1
```
