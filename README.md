# 2026 Nepal Floods

Volunteer routing tool for the **August 2026 Bhotekoshi / Rasuwa / Gyirong / Trishuli** flash floods.

**Independent & unofficial.** Not affiliated with any government or official organisation. See [`legal.html`](legal.html) for the disclaimer, privacy notice (we do not collect or store personal case data), and terms of use.

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
| `/resources.html` | Helplines, portals, social accounts |
| `/wizard.html` | Who to contact |
| `/search.html` | Redirect to official **found** lists |
| `/report.html` | Report helper → WhatsApp / email |
