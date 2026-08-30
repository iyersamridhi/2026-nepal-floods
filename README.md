# Nepal Floods 2026

Volunteer page of **public contacts, missing-person forms, and government updates** after the August 2026 floods in northern Nepal (SETU, Nepal Police, MoFA, embassies).

**Live site:** https://2026-nepal-floods.vercel.app

**Independent & unofficial.** Not affiliated with any government. See [`legal.html`](legal.html) for disclaimer and privacy (we do not collect or store personal case data).

## SEO / search indexing

- Keyword titles & descriptions on every page (Bhotekoshi, Rasuwa, Gyirong, MoFA, MEA control room, etc.)
- [`robots.txt`](robots.txt) + [`sitemap.xml`](sitemap.xml)
- Updates stay fresh via GitHub Action (~30 min)

**You still need to submit once** (Google/Bing accounts required — see [`docs/SEO.md`](docs/SEO.md)):

1. [Google Search Console](https://search.google.com/search-console) → add `https://2026-nepal-floods.vercel.app` → submit sitemap `https://2026-nepal-floods.vercel.app/sitemap.xml`
2. Optional: [Bing Webmaster Tools](https://www.bing.com/webmasters) → same sitemap

## Deploy on Vercel

This is a static site — no build step required.

1. Push this repo to GitHub
2. Go to [vercel.com/new](https://vercel.com/new) → Import the repository
3. **Framework preset:** Other (no build command)
4. **Output directory:** `.` (project root)
5. Deploy

Or from the CLI:

```bash
npx vercel --prod
```

### Keeping bulletins fresh (GitHub Actions)

Vercel hosts the static files; bulletins are updated by a scheduled GitHub Action that runs `./scripts/refresh.sh` and commits `data/bulletin.json` + `data/twitter_bulletin.json`.

Add these **repository secrets** in GitHub → Settings → Secrets:

| Secret | Purpose |
|--------|---------|
| `XAI_API_KEY` | Grok summarization (optional but recommended) |
| `TWITTER_BEARER_TOKEN` | Live Twitter fetch (optional) |

The workflow runs every 30 minutes (`.github/workflows/refresh-bulletin.yml`). Each run triggers a Vercel redeploy if the repo is connected with auto-deploy.

## Bulletin scraping (local)

```bash
python3 scripts/scrape_official.py   # MoFA → data/bulletin.json
python3 scripts/scrape_twitter.py    # Authority posts → data/twitter_bulletin.json
./scripts/refresh.sh                 # both
```

**What gets scraped automatically:**
- [MoFA flash flood category](https://mofa.gov.np/category/flashflood/)
- Manual authority posts in `data/seeds/twitter_manual.json` (until Twitter API is configured)

### Grok / xAI summarization (optional)

```bash
export XAI_API_KEY=your_key
python3 scripts/scrape_official.py
```

### Twitter from local authorities (optional)

```bash
export TWITTER_BEARER_TOKEN=your_x_api_token
# set twitter.enabled: true in data/sources.json
python3 scripts/scrape_twitter.py
```

Without Twitter API: add posts to `data/seeds/twitter_manual.json`.

## Run site locally

```bash
python3 scripts/serve.py
# http://localhost:8080
```

## Pages

| Page | Purpose |
|------|---------|
| `/updates.html` | **News from official channels** + **Twitter / X** (separate tabs) |
| `/resources.html` | Searchable contacts, helplines, portals |
| `/wizard.html` | Who to contact |
| `/search.html` | Redirect to official **found** lists |
| `/report.html` | Report helper → WhatsApp / email |
