# Arcane Reader — Agent Instructions

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

Details: `@.cursor/rules/engine.mdc`, `@README.md`.
