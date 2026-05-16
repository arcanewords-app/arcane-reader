---
type: plan
status: active
domain: infra
stale: false
created: 2026-05-16
updated: 2026-05-16
canonical: .cursor/rules/routing.mdc
source_archive: ../archive/SEO_GOOGLE_INDEXING_PLAN.md
---

# SEO — Google Search Console

## Goal

Complete indexing setup after technical SEO implementation.

## Done (verified in `src/server.ts`)

- [x] `GET /robots.txt`, `GET /sitemap.xml` (+ Vercel rewrites)
- [x] Dynamic publication URLs in sitemap
- [x] Base meta in `index.html`; publication meta from server where implemented

## Open tasks

- [ ] Register property in Google Search Console
- [ ] Submit sitemap URL (`{PUBLIC_URL}/sitemap.xml`)
- [ ] Verify indexing for `/`, `/catalog`, sample `/p/:id` pages
- [ ] Optional: `VITE_GA_MEASUREMENT_ID` + cookie consent flow (see `env.example.txt`)

## References

- Routes: [[../_canonical/rules/routing]] (SEO section)
- `../archive/SEO_GOOGLE_INDEXING_PLAN.md`
