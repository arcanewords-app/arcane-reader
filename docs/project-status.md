---
type: reference
status: active
domain: meta
stale: false
updated: 2026-05-16
---

# Project status

**Use in AI sessions:** `@docs/project-status.md` at the start of complex tasks.

**Strategic priorities and phases:** [[ROADMAP]]

Update this file when completing plans or shipping major features.

## Currently implemented (code-verified)

- Preact SPA + Express API + Supabase (auth, DB, storage)
- Public catalog (`/`, `/catalog`) and publication reading (`/p/:id`)
- Author workspace: projects, chapters, glossary (incl. merge suggestions)
- 3-stage pipeline: analyze → translate → edit
- Text blocks via `{{block:type-id}}` markers
- EPUB/FB2 import and export; publication build-exports
- Daily token limits + usage UI (`tokenLimits`, `TokenUsageIndicator`)
- Async batch analyze/translate via BullMQ (Redis + worker)
- SEO: robots.txt, sitemap.xml, publication meta
- UI i18n: ru / en / pl + header locale switcher
- Redis cache layer with invalidation contract

## Active plans (`05-plans/`)

| Plan                                      | Domain                      |
| ----------------------------------------- | --------------------------- |
| [[05-plans/engine-pipeline-improvements]] | Stage 3 paragraph alignment |
| [[05-plans/engine-refactor]]              | Cancel/resume, draft saves  |
| [[05-plans/multilingual-ui-audit]]        | Hardcoded string cleanup    |
| [[05-plans/reader-theme-improvements]]    | Reader contrast/themes      |
| [[05-plans/seo-search-console]]           | GSC submission              |
| [[05-plans/tokenization-follow-ups]]      | Daily reset ops             |

## Known tech debt

- Large legacy docs in `docs/archive/` — treat as stale; use `.cursor/rules/` + code
- Publication reading settings not persisted (defaults to dark) — see reader-theme plan
- Some engine edge cases documented only in archive E2E files

## Documentation entry points

- Master roadmap: [[ROADMAP]]
- Agent SSOT: `.cursor/rules/` (see [[Home#Canonical rules]])
- Vault MOC: [[Home]]
- Triage log: [[_meta/archive-triage]]
