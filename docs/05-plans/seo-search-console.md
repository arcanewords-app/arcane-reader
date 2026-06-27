---
type: plan
status: active
domain: infra
stale: false
created: 2026-05-16
updated: 2026-06-28
canonical: .cursor/rules/routing.mdc
source_archive: ../archive/SEO_GOOGLE_INDEXING_PLAN.md
---

# SEO — Google Search Console

## Goal

Complete indexing setup after technical SEO implementation.

## Done (code — deploy to verify on production)

- [x] `GET /robots.txt`, `GET /sitemap.xml` (+ Vercel rewrites)
- [x] `robots.txt` SSOT: `src/shared/robotsTxt.ts` (Express + `api/robots.ts`, includes `/translation-requests` disallow)
- [x] Dynamic publication URLs in sitemap
- [x] Published news URLs in sitemap (up to 100, `SITEMAP_NEWS_LIMIT`)
- [x] `/account-tiers` in sitemap and SSR
- [x] Base meta in `index.html`; `twitter:image` default
- [x] Publication meta from server for `/p/*`
- [x] News detail SSR: `/news/:slugOrId` — meta, NewsArticle JSON-LD, crawler content
- [x] Vercel rewrites for `/`, `/catalog`, `/about`, `/contact`, `/privacy`, `/terms`, `/news`, `/news/:slug*`, `/account-tiers`, `/p/*` → SSR meta
- [x] HTTPS canonical via `getPublicBaseUrl()`
- [x] Client hooks: `usePageMeta` (publications + news), `useStaticPageMeta` (info pages)
- [x] Static page meta SSOT: `src/shared/staticPageMeta.ts`
- [x] Baseline audits: [`seo-audit-2026-06-01.md`](seo-audit-2026-06-01.md) (archived), [`seo-audit-2026-06-28.md`](seo-audit-2026-06-28.md)

## Open tasks (human-ops)

Follow these steps in [Google Search Console](https://search.google.com/search-console):

1. **Add property** — URL prefix `https://arcane-reader.vercel.app` (or custom domain when live).
2. **Verify ownership** — HTML tag or DNS (Vercel DNS if using custom domain).
3. **Submit sitemap** — `https://arcane-reader.vercel.app/sitemap.xml`
4. **URL Inspection** — request indexing for:
   - `https://arcane-reader.vercel.app/`
   - `https://arcane-reader.vercel.app/catalog`
   - One publication, e.g. `https://arcane-reader.vercel.app/p/tsikl-neizbezhnosti-polnaya-kniga`
   - One news post, e.g. `https://arcane-reader.vercel.app/news/account-tiers`
5. **After deploy** — re-run curl checks in [`seo-audit-2026-06-28.md`](seo-audit-2026-06-28.md) verify section.
6. **Optional:** [PageSpeed Insights](https://pagespeed.web.dev/) on `/` and one `/p/*`.
7. **Optional:** `VITE_GA_MEASUREMENT_ID` + cookie consent (see `env.example.txt`).

- [ ] Register property in Google Search Console
- [ ] Verify ownership
- [ ] Submit sitemap URL
- [ ] URL inspection: `/`, `/catalog`, sample `/p/*`, sample `/news/*`
- [ ] PageSpeed Insights sample (optional)
- [ ] GA4 measurement ID in production (optional)

## Author content

- [x] [`seo-author-content-guide.md`](seo-author-content-guide.md) for publication descriptions

## References

- Routes: [[../_canonical/rules/routing]] (SEO section)
- Policy: `.cursor/rules/seo.mdc`
- `../archive/SEO_GOOGLE_INDEXING_PLAN.md`
