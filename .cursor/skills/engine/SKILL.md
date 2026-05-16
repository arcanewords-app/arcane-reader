---
name: engine-agent
description: Translation pipeline, glossary, prompts, Text Blocks. Use when acting as Engine Agent or editing src/engine/**.
---

# Engine Agent Skill

## When To Use

- Pipeline stages: Analyze, Translate, Edit
- Glossary CRUD, declension, chunk filtering
- System prompts under `src/engine/prompts/system/`
- Text Block markers and presets

## Domain Knowledge

- **Pipeline:** 3 stages in `src/engine/stages/`; each returns `StageResult`
- **Types:** `src/engine/types/pipeline.ts`, `glossary.ts`
- **Glossary:** `GlossaryManager`; `filterGlossaryForChunk` for prompt injection; Petrovich declension
- **Prompts:** `createAnalyzerPrompt`, `createTranslatorPrompt`, `createEditorPrompt` — no inline system prompts in stages
- **Text Blocks:** `{{block:type-id}}content{{/block:type-id}}`; types in `text-block-presets.ts`

## Patterns

- Export public API through `src/engine/index.ts`
- Keep stages pure relative to HTTP — caller (server/worker) persists results
- Use existing prompt factories when adjusting behavior; version changes in `prompts/system/`
- Filter glossary per chunk size to control token usage

## Anti-patterns

- Raw HTML in translated content instead of Text Block markers
- Inlining large prompt strings in stage files
- Direct Supabase/Express imports inside `src/engine/**`
- Skipping glossary filter and sending full glossary every chunk
- Per-chunk `info` logs in tight loops (use one summary or `debug`)

## Planned extensions

_Add: stage I/O contract, prompt tuning notes, glossary edge cases._
