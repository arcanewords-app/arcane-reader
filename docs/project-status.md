---
type: reference
status: active
domain: meta
stale: false
updated: 2026-07-11
---

# Project status

**Use in AI sessions:** `@docs/project-status.md` at the start of complex tasks.

**Strategic priorities and phases:** [[ROADMAP]]

Update this file when completing plans or shipping major features.

## Currently implemented (code-verified)

- Preact SPA + Express API + Supabase (auth, DB, storage)
- Public catalog (`/`, `/catalog`) and publication reading (`/p/:id`)
- Reading mode: chapter URL sync on prev/next/TOC (`route()` push); reload/share/back work — [[03-explanation/addressable-ui-state]], policy [[_canonical/rules/spa-navigation]]
- Profile tabs + publication chapter filters synced to URL query (Phase 1) — `profileRoutes.ts`, `publicationRoutes.ts`
- Project search deep links (`/projects/:id?search=`, chapter `?search=&paragraph=`) — `projectRoutes.ts` (Phase 2)
- Guest reading paragraph URL (`/p/.../reading?paragraph=N`) — `readingRoutes.ts` (Phase 3)
- Shared `useUrlSync` hook + `catalogRoutes.ts`; route builder unit tests (`npm run test:url-routes`)
- Author workspace: projects, chapters, glossary (incl. merge suggestions)
- 3-stage pipeline: analyze → translate → edit
- Engine as-is docs: [[03-explanation/engine-pipeline]], [[03-explanation/engine-glossary-and-prompts]], [[03-explanation/engine-integration-boundary]]
- Text blocks via `{{block:type-id}}` markers
- EPUB/FB2 import and export; publication build-exports
- Daily token limits + usage UI (`tokenLimits`, `TokenUsageIndicator`)
- Async batch analyze/translate via BullMQ (Redis + worker)
- SEO: robots.txt, sitemap.xml, publication meta
- UI i18n: ru / en + header locale switcher (pl removed from app locales)
- Translation pairs: en | ko | zh → ru (project `source_language` / `target_language`; prompts in `src/engine/prompts/pairs/`)
- Redis cache layer with invalidation contract
- Structured logging (Pino): dev `/debug` console; prod/staging Axiom when `LOG_SHIPPING=1` — [[02-how-to/observability-axiom]]

- News feed (`/news`) + announcement banner; admin at `/admin/news`; GA4 announcement events; migration `20250618_news_and_announcements`
- Project-wide search and replace in author workspace; smart AI replace (Author+) for declensions and term fixes — `/news/project-search-replace`

## Active plans (`05-plans/`)

| Plan                                      | Domain                                                                                             |
| ----------------------------------------- | -------------------------------------------------------------------------------------------------- |
| [[05-plans/engine-pipeline-improvements]] | Stage 3 paragraph alignment                                                                        |
| [[05-plans/engine-cjk-ru-spike]]          | CJK rollout shipped (ko/zh→ru); ja Phase 2 pending                                                 |
| [[05-plans/engine-refactor]]              | Cancel/resume by chunk (draft save done)                                                           |
| [[05-plans/multilingual-ui-audit]]        | Hardcoded string cleanup                                                                           |
| [[05-plans/reader-theme-improvements]]    | Reader contrast/themes                                                                             |
| [[05-plans/seo-search-console]]           | GSC submission                                                                                     |
| [[05-plans/tokenization-follow-ups]]      | Daily reset ops                                                                                    |
| [[05-plans/web-scraper-research]]         | Web scraper: [arcane-scraper](https://github.com/arcane-scraper) repo; reader integration deferred |

## Known tech debt

- Large legacy docs in `docs/archive/` — treat as stale; use `.cursor/rules/` + code
- Publication reading settings not persisted (defaults to dark) — see reader-theme plan
- Stage 3 chunk alignment still open — see [[05-plans/engine-pipeline-improvements]]; archive E2E superseded by [[03-explanation/engine-integration-boundary]]

## Documentation entry points

- Master roadmap: [[ROADMAP]]
- Agent SSOT: `.cursor/rules/` (see [[Home#Canonical rules]])
- Vault MOC: [[Home]]
- Triage log: [[_meta/archive-triage]]
