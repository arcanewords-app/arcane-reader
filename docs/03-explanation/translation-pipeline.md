---
type: explanation
status: active
domain: engine
stale: false
canonical: .cursor/rules/engine.mdc
created: 2026-05-16
updated: 2026-05-16
---

# Translation pipeline

Derived from [[_canonical/rules/engine]] and `src/engine/`. Do not trust `archive/TRANSLATION_*.md` without verification.

## Stages

1. **Analyze** — entities, style, glossary candidates (`src/engine/stages/`)
2. **Translate** — main translation with glossary injection
3. **Edit** — polish / chunk alignment

Each stage returns `StageResult`. Orchestration: `src/engine/pipeline/`.

## Text blocks

Markers: `{{block:type-id}}text{{/block:type-id}}`. Types: `@src/engine/constants/text-block-presets.ts`. No raw HTML for blocks.

## Glossary

- `GlossaryManager` CRUD; `filterGlossaryForChunk` for prompts
- Declension: `declineName`, `declineNameRu`
- DB columns: snake_case (`gender`, `location_type`, …)

## Prompts

System prompts in `src/engine/prompts/system/`. Use `createAnalyzerPrompt`, `createTranslatorPrompt`, `createEditorPrompt`.

## Async jobs

Batch analyze/translate may use BullMQ (`src/worker.ts`, `REDIS_URL`). See [[_canonical/rules/routing]] — Async Jobs section.
