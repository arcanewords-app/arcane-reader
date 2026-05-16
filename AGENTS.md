# Arcane Reader — Agent Instructions

## Documentation (SSOT)

**Canonical source:** [`.cursor/rules/`](.cursor/rules/) — always prefer rules + code over `docs/archive/` legacy files.

| Rule | Topic |
|------|--------|
| `core.mdc` | Code style, structure |
| `architecture.mdc` | System architecture |
| `api.mdc` | Express API, Zod, 503 |
| `routing.mdc` | **Route map (SSOT)** |
| `cache.mdc` | Redis invalidation |
| `auth.mdc` | Roles, JWT |
| `engine.mdc` | Translation pipeline |
| `client.mdc` | Preact UI |
| `design-system.mdc` | Tokens, icons, a11y |

**Human vault (plans, ADR):** [`docs/Home.md`](docs/Home.md) — Obsidian; not agent SSOT.

When changing routes: update `routing.mdc`, `src/client/AppRouter.tsx`, and `src/server.ts` in one task.

## Architecture

- **client/** — Preact UI, Vite, i18next. Pages, components, hooks, contexts.
- **engine/** — Translation pipeline: Analyze → Translate → Edit. Glossary, prompts, stages.
- **services/** — Import (epub, fb2, csv, txt), export (epub, fb2), auth, storage.
- **storage/** — DB layer. Supabase for prod, LowDB fallback.
- **middleware/** — Express: auth, requestContext, serviceHealth.

## Conventions

- TypeScript strict. Preact (not React). Functional components.
- snake_case for DB columns. See `@storage/database.ts`.
- 2 spaces, LF, UTF-8 — `.editorconfig`.
- Lint: `npm run lint`, typecheck: `npm run typecheck`, format: `npm run format`.

## Project specifics

- **Text Blocks**: `{{block:type-id}}text{{/block:type-id}}`. Types in `@src/engine/constants/text-block-presets.ts`.
- **Glossary**: characters, locations, terms. Declension via Petrovich.
- **Pipeline**: 3 stages. Prompts in `src/engine/prompts/system/`.

Details: `@.cursor/rules/engine.mdc`, `@.cursor/rules/architecture.mdc`, `@README.md`.

## Supabase Docs

Before working on a Supabase feature, check the docs via `ssh supabase.sh <command>`.

```bash
# Search for a topic
ssh supabase.sh grep -rl 'auth' /supabase/docs/

# Read a specific guide
ssh supabase.sh cat /supabase/docs/guides/auth/passwords.md

# Find all guides in a section
ssh supabase.sh find /supabase/docs/guides/database -name '*.md'

# Search with context
ssh supabase.sh grep -r 'RLS' /supabase/docs/guides/auth --include='*.md' -l
```

All docs live under `/supabase/docs/` as markdown files. You can use any standard Unix tools (grep, find, cat, etc.) to search and read them.
