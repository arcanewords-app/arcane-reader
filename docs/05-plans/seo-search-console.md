---
type: plan
status: active
domain: infra
stale: false
created: 2026-05-16
updated: 2026-06-01
canonical: .cursor/rules/routing.mdc
source_archive: ../archive/SEO_GOOGLE_INDEXING_PLAN.md
---

# SEO — Google Search Console

## Goal

Complete indexing setup after technical SEO implementation.

## Done (verified in `src/server.ts` + production curl 2026-06-01)

- [x] `GET /robots.txt`, `GET /sitemap.xml` (+ Vercel rewrites)
- [x] Dynamic publication URLs in sitemap
- [x] Base meta in `index.html`; publication meta from server for `/p/*`
- [x] Vercel rewrites for `/`, `/catalog`, `/about`, `/contact`, `/privacy`, `/terms` → SSR meta (`vercel.json`, deploy pending)
- [x] HTTPS canonical via `getPublicBaseUrl()` (deploy pending)
- [x] Baseline audit: [`seo-audit-2026-06-01.md`](seo-audit-2026-06-01.md)

## Open tasks (human-ops)

- [ ] Register property in Google Search Console
- [ ] Submit sitemap URL (`{PUBLIC_URL}/sitemap.xml`)
- [ ] Verify indexing for `/`, `/catalog`, sample `/p/:id` pages
- [ ] After deploy: re-check static pages return unique `<title>` (see audit doc verify section)
- [ ] Optional: `VITE_GA_MEASUREMENT_ID` + cookie consent flow (see `env.example.txt`)

## Author content

- [x] [`seo-author-content-guide.md`](seo-author-content-guide.md) for publication descriptions

## References

- Routes: [[../_canonical/rules/routing]] (SEO section)
- Policy: `.cursor/rules/seo.mdc`
- `../archive/SEO_GOOGLE_INDEXING_PLAN.md`
