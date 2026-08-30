# SEO status (for agents & humans)

**Last updated:** 2026-08-30  
**Live site:** https://2026-nepal-floods.vercel.app  
**Repo:** https://github.com/iyersamridhi/2026-nepal-floods

> **Agents: SEO basics are already implemented.** Do not re-add titles/sitemap/robots from scratch unless something is missing or broken. Prefer extending this doc when you change SEO.

---

## Done

| Item | Status | Notes |
|------|--------|--------|
| Keyword `<title>` + `<meta name="description">` on all HTML pages | Done | Soft wording: official contacts / SETU forms / MoFA helplines — **avoid “missing person routing”** (misleading). Keywords: Bhotekoshi, Rasuwa, Gyirong, MoFA, MEA, SETU, Nepal Police |
| Canonical URLs | Done | Per-page `link rel="canonical"` → vercel.app |
| Open Graph + Twitter cards | Done | Shared image: `/assets/og-share.png` |
| `robots.txt` | Done | https://2026-nepal-floods.vercel.app/robots.txt |
| `sitemap.xml` | Done | https://2026-nepal-floods.vercel.app/sitemap.xml |
| Google Search Console property | Done | URL-prefix property for vercel.app |
| GSC HTML verification file | Done | Root file `google3e1e15a0daa51e2c.html` (do not delete) |
| GSC ownership verified | Done | User verified 2026-08-30 |
| Sitemap submitted in GSC | Assumed / user in progress | Sitemap URL detected by Google |
| Fresh updates for crawlers | Done | GitHub Action refreshes bulletins ~every 30 min |

### Pages with SEO meta

- `index.html`, `wizard.html`, `search.html`, `report.html`, `updates.html`, `resources.html`, `feedback.html`, `legal.html`

### Files not to remove

- `google3e1e15a0daa51e2c.html` — Google site verification  
- `robots.txt`, `sitemap.xml`  
- `assets/og-share.png` — social / OG preview  

---

## In progress / user-side (not code)

| Item | Status |
|------|--------|
| GSC daily **Request indexing** quota may hit “Quota exceeded” — try again next day
| GSC → **Request indexing** for `/`, `/updates.html`, `/resources.html`, `/report.html`, `/wizard.html` | User action |
| Google status may show **“Discovered – currently not indexed”** | Normal for new sites (hours–days) |
| Bing Webmaster Tools | Optional — not required |

---

## Not done (optional future)

- Bing property + sitemap submit  
- WhatsApp / copy-link share buttons for organic sharing  
- Stronger Nepali/Hindi meta / `hreflang` if bilingual pages expand  
- Custom domain (would need new GSC property + update canonicals/sitemap)  

---

## If you change the site URL or domain

1. Update all `canonical`, `og:url`, `og:image`, and `sitemap.xml` / `robots.txt` Sitemap lines  
2. Re-verify Search Console for the new host  
3. Keep or re-add a Google verification file if using the HTML-file method  

---

### Social preview cache (LinkedIn / Facebook)

The site HTML can be correct while LinkedIn still shows an **old card**. That is LinkedIn’s cache, not Vercel.

1. Open [LinkedIn Post Inspector](https://www.linkedin.com/post-inspector/)
2. Paste `https://2026-nepal-floods.vercel.app/`
3. Click **Inspect** — this refreshes their preview
4. Share the link again in a **new** LinkedIn post (old posts may keep the old card)

WhatsApp usually refreshes faster; LinkedIn can lag days until Post Inspector is used.

`og:image` uses a `?v=` query so crawlers treat it as a new asset after title/copy changes.
