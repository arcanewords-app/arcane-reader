---
type: explanation
status: active
domain: meta
stale: false
canonical: .cursor/rules/architecture.mdc
created: 2026-05-16
updated: 2026-05-16
---

# Project overview

**Arcane Reader** — web app for AI-assisted fiction translation (EN → RU focus) with glossary, three-stage pipeline, reading mode, and EPUB/FB2 export.

## Stack

| Layer | Tech |
|-------|------|
| Frontend | Preact, Vite, i18next |
| Backend | Express, TypeScript, Zod |
| Data | Supabase (Postgres, Auth, Storage) |
| Cache | Upstash Redis |
| AI | OpenAI / providers via Arcane Engine |

## Core entities

- **Project** — chapters, glossary, settings, metadata
- **Chapter** — original + translated text, paragraph-level editing
- **GlossaryEntry** — characters, locations, terms
- **Publication** — public catalog and reading

## Where to read more

- Architecture: [[_canonical/rules/architecture]]
- Routes: [[_canonical/rules/routing]]
- Engine: [[translation-pipeline]]
- Legacy detail (may be stale): `archive/PROJECT_SUMMARY.md`
