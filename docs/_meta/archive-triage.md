---
type: reference
status: active
domain: meta
stale: false
updated: 2026-05-16
---

# Archive triage (2026-05-16)

74 files in `docs/archive/`. Verified against `src/` and `.cursor/rules/`.

## Moved to active plans (`05-plans/`)

| Archive source                     | Active plan                                  | Verification                            |
| ---------------------------------- | -------------------------------------------- | --------------------------------------- |
| `IMPROVEMENT_PLAN_NEXT.md`         | [[../05-plans/engine-pipeline-improvements]] | Stage 3 para markers still open         |
| `ENGINE_REFACTOR_PLAN.md`          | [[../05-plans/engine-refactor]]              | Phases 2+ partially open                |
| `MULTILINGUAL_PLAN.md`             | [[../05-plans/multilingual-ui-audit]]        | ru/en/pl + Header locale switcher exist |
| `READER_THEME_IMPROVEMENT_PLAN.md` | [[../05-plans/reader-theme-improvements]]    | Themes exist; contrast work open        |
| `SEO_GOOGLE_INDEXING_PLAN.md`      | [[../05-plans/seo-search-console]]           | robots/sitemap/meta done; GSC open      |
| `TOKENIZATION_PLAN.md`             | [[../05-plans/tokenization-follow-ups]]      | `tokenLimits.ts`, UI, API implemented   |

## Stay in archive (done or superseded)

| Pattern / files                                   | Reason                                       |
| ------------------------------------------------- | -------------------------------------------- |
| `ARCHITECTURE.md`, `API.md`, `PROJECT_SUMMARY.md` | Superseded by rules + `03-explanation/`      |
| `GLOSSARY_MERGE_SUGGESTIONS_FLOW.md`              | Implemented: `suggest-merges` route + UI     |
| `PUBLIC_HOME_PLAN.md`, `PUBLIC_MAIN_PAGE_PLAN.md` | CatalogPage, `/catalog`, filters implemented |
| `*_FIX.md`, `*_E2E.md`, `*_ANALYSIS.md`           | Historical analysis                          |
| `ICONS_PLAN.md`                                   | Merged into `design-system.mdc`              |
| `ROUTES.md` (archive copy if any)                 | SSOT: `routing.mdc`                          |

## Review before promoting

Large plans need line-by-line review against code before expanding tasks:

- `REFACTOR_PLAN.md`, `UPLOAD_TRANSLATION_*.md`, `ROLES_AND_AUTH_REFACTOR_PLAN.md`
