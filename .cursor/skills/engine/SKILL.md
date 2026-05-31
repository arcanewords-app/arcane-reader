---
name: engine-agent
description: Translation pipeline, glossary, prompts, Text Blocks. Use when acting as Engine Agent or editing src/engine/**.
---

# Engine Agent Skill

## When To Use

- Pipeline stages: Analyze, Translate, Edit
- Glossary CRUD, declension, chunk filtering
- Per-pair prompts under `src/engine/prompts/pairs/{src}-ru/`; registry in `prompts/registry.ts`
- Editor: `src/engine/prompts/system/editor.ts`
- Language whitelist: `src/engine/language.ts`
- Text Block markers and presets

## As-is documentation

Read before large engine work:

- `docs/03-explanation/engine-pipeline.md` — stages, `PipelineOptions`, chunk matrix, Stage 3 limits
- `docs/03-explanation/engine-glossary-and-prompts.md` — glossary, prompts, text blocks, para markers
- `docs/03-explanation/engine-integration-boundary.md` — server/worker, draft, sync, cancel

## Domain Knowledge

- **Pipeline:** 3 stages in `src/engine/stages/`; each returns `StageResult`
- **Types:** `src/engine/types/pipeline.ts`, `glossary.ts`
- **Glossary:** `GlossaryManager`; `filterGlossaryByChapter` + `filterGlossaryForChunk`; Petrovich declension
- **Prompts:** `resolvePrompts(stage, source, target)` — no inline system prompts in stages; no direct pair imports in stages
- **Languages:** MVP sources `en|ko|zh` → target `ru`; `ja` Phase 2
- **Text Blocks:** `{{block:type-id}}content{{/block:type-id}}`; types in `text-block-presets.ts`
- **Logging:** `log` from `src/engine/logger.js`

## Patterns

- Export public API through `src/engine/index.ts`
- Keep stages pure relative to HTTP — caller (server/worker) persists results
- Language-specific prompt changes → `prompts/pairs/{src}-ru/` only; bump `// prompt-version` on major edits
- Filter glossary per chunk size to control token usage

## Anti-patterns

- Raw HTML in translated content instead of Text Block markers
- Inlining large prompt strings in stage files
- Direct Supabase/Express imports inside `src/engine/**`
- Skipping glossary filter and sending full glossary every chunk
- Per-chunk `info` logs in tight loops (use one summary or `debug`)
