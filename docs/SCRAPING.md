# Scraping & summarization architecture

## Do you need an agent?

**No.** A hash-diff cron over a configured source list is enough:

```
Every 30–60 min (GitHub Actions):
  1. Read data/sources.json → officialSources[]
  2. For each enabled source:
     - category → discover URLs (MoFA)
     - url → fetch static HTML (MEA, Xinhua, …)
     - seed → curated JSON pointer (NDRRMA portal, Nepal Police UDB, …)
  3. Hash body text → if unchanged, skip Grok
  4. If new/changed → summarize → merge into data/bulletin.json
  5. Twitter script runs separately → data/twitter_bulletin.json
  6. Commit + push → Vercel redeploys
```

Grok is a **summarizer only** — it does not decide what to scrape.

## Official sources (auto)

Configured in `data/sources.json` → `officialSources`:

| Source | Type | Output |
|--------|------|--------|
| **MoFA flash flood category** | category | Discovers all daily updates |
| **India MEA control room** | url (+ seed fallback) | Press release |
| **Xinhua Gyirong** | url | Tibet/China-side rescue coverage |
| **NDRRMA portal** | seed | Link to ndrrma.gov.np/np/rescue |
| **Nepal Police UDB** | seed | Link to official found/missing lists |
| **Embassy of India, Kathmandu** | seed | Contact pointer for Indian nationals |

Add new static URLs or seed files to `officialSources` — no code change needed for most cases.

## Link-only (Resources page)

| Source | Why |
|--------|-----|
| **SETU** | App UI — link only |
| **Chinese Embassy Nepal** | Consular contacts on Resources page |
| **Nepal Police UDB photos** | Don't republish — redirect only |

## Twitter (separate bulletin)

**Accounts** (in `data/sources.json` → `twitter.accounts`):

- @NDRRMA_Nepal, @NepalPoliceHQ, @MoFANepal
- @MEAIndia, @IndiainNepal
- @NepalArmyHQ, @USEmbassyNepal, @NepalTourismBoard

**Requires:** `TWITTER_BEARER_TOKEN` in GitHub Secrets for live fetch.  
Without API: manual seeds in `data/seeds/twitter_manual.json`.

## Summarization

| Mode | When | Cost |
|------|------|------|
| **Rule-based** | Always, as fallback | Free |
| **Grok (xAI)** | When `XAI_API_KEY` set AND content changed | ~$0.001 per changed article |

## Cron / GitHub Actions

```bash
./scripts/refresh.sh   # both official + Twitter
```

Workflow: `.github/workflows/refresh-bulletin.yml` (every 30 min + manual dispatch).

Secrets: `XAI_API_KEY`, `TWITTER_BEARER_TOKEN` (both optional but recommended).
