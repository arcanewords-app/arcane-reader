---
type: reference
status: active
domain: meta
stale: false
updated: 2026-09-13
---

# Project status

**Use in AI sessions:** `@docs/project-status.md` at the start of complex tasks.

**Strategic priorities and phases:** [[ROADMAP]]

Update this file when completing plans or shipping major features.

## Currently implemented (code-verified)

- Preact SPA + Express API + Supabase (auth, DB, storage)
- TypeScript **7** (`typescript@^7`); lint is **oxlint** + type-aware (`oxlint-tsgolint`); Prettier + Stylelint unchanged
- Public catalog (`/`, `/catalog`) and publication reading (`/p/:id`)
- Reading mode: chapter URL sync on prev/next/TOC (`route()` push); reload/share/back work — [[03-explanation/addressable-ui-state]], policy [[_canonical/rules/spa-navigation]]
- Profile tabs + publication chapter filters synced to URL query (Phase 1) — `profileRoutes.ts`, `publicationRoutes.ts`
- Project search deep links (`/projects/:id?search=`, chapter `?search=&paragraph=`) — `projectRoutes.ts` (Phase 2)
- Guest reading paragraph URL (`/p/.../reading?paragraph=N`) — `readingRoutes.ts` (Phase 3)
- Shared `useUrlSync` hook + `catalogRoutes.ts`; route builder unit tests (`npm run test -- src/client/utils/urlRoutes.test.ts`)
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

| Plan                                      | Domain                                                                                                                     |
| ----------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| [[05-plans/engine-pipeline-improvements]] | Stage 3 paragraph alignment                                                                                                |
| [[05-plans/engine-cjk-ru-spike]]          | CJK rollout shipped (ko/zh→ru); ja Phase 2 pending                                                                         |
| [[05-plans/engine-refactor]]              | Cancel/resume by chunk (draft save done)                                                                                   |
| [[05-plans/multilingual-ui-audit]]        | Hardcoded string cleanup                                                                                                   |
| [[05-plans/reader-theme-improvements]]    | Reader contrast/themes                                                                                                     |
| [[05-plans/seo-search-console]]           | GSC submission                                                                                                             |
| [[05-plans/tokenization-follow-ups]]      | Daily reset ops                                                                                                            |
| [[05-plans/testing-strategy]]             | Pyramid SSOT: Waves 6–9 **done**; Wave 10 local E2E unblocked; GitHub Actions mock pyramid; CI live stack still blocked    |
| [[05-plans/testing-baseline]]             | Coverage floors 77/65; local Playwright vs stamp; Q4 CI live stack blocked                                                 |
| [[05-plans/web-scraper-research]]         | Web scraper: [arcane-scraper](https://github.com/arcane-scraper) repo; reader integration deferred                         |
| [[05-plans/db-schema-cleanup]]            | Unused GIN trgm dropped on prod (2026-08-29); remaining RLS/btree/cache DDL **not** prod                                   |
| [[05-plans/adaptive-ui]]                  | I0–I5 shipped (Header wrap, CardGrid, 48 visual PNGs). Leftover: container queries per surface, news/admin shells on touch |
| [[05-plans/dependency-major-backlog]]     | Deferred npm majors (`@types/node` 26, …) — one major per PR |

## Known tech debt

- **Local stack available** — `npm run stack:up` (Docker Redis + local Supabase; restores `arcane-reader-stamp:latest` if present). `.env` = local demo JWTs/Redis; `.env.local` = secrets + `SUPABASE_DUMP_*` (`src/loadEnv.ts`). Local E2E: `npm run test:e2e` after `stack:up` + `dev`. Monthly stamp rebuild: `stack:dump` / `stack:load` / `stack:stamp`. GitHub Actions runs the mock pyramid; CI live stack (Playwright-as-gate) is still blocked. Schema and data dumps are **local/gitignored**. Never push the dump or stamp image to a public registry.
- Large legacy docs in `docs/archive/` — treat as stale; use `.cursor/rules/` + code
- Publication reading settings not persisted (defaults to dark) — see reader-theme plan
- Stage 3 chunk alignment still open — see [[05-plans/engine-pipeline-improvements]]; archive E2E superseded by [[03-explanation/engine-integration-boundary]]

## Documentation entry points

- Master roadmap: [[ROADMAP]]
- Agent SSOT: `.cursor/rules/` (see [[Home#Canonical rules]])
- Vault MOC: [[Home]]
- Triage log: [[_meta/archive-triage]]
