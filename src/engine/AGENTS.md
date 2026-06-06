# Engine — nested agent context

Applies when editing `src/engine/**`. Global rules: `.cursor/rules/engine.mdc`, profile [`.cursor/agents/engine/AGENT.md`](../../.cursor/agents/engine/AGENT.md), skill [`.cursor/skills/engine/SKILL.md`](../../.cursor/skills/engine/SKILL.md).

## As-is docs (vault)

- [`docs/03-explanation/engine-pipeline.md`](../../docs/03-explanation/engine-pipeline.md)
- [`docs/03-explanation/engine-glossary-and-prompts.md`](../../docs/03-explanation/engine-glossary-and-prompts.md)
- [`docs/03-explanation/engine-integration-boundary.md`](../../docs/03-explanation/engine-integration-boundary.md)

## Pipeline

- **Stages:** Analyze → Translate → Edit (`src/engine/stages/`)
- **Output:** each stage returns `StageResult` per existing patterns
- **Persistence:** caller (server/worker) saves results — no HTTP/DB in engine code

## Prompts

- Use `resolvePrompts(stage, source, target)` from `src/engine/prompts/registry.ts`
- Per-pair modules: `src/engine/prompts/pairs/{src}-ru/` — do not inline prompts in stages

## Languages (MVP)

- Pairs: en/ko/zh→ru, en/ko/zh/ru→be (default en→ru). Whitelist: `src/engine/language.ts`. `ja` = Phase 2.

## Glossary & Text Blocks

- Inject glossary via `filterGlossaryByChapter` + `filterGlossaryForChunk` where applicable
- **Text Blocks:** `{{block:type-id}}content{{/block:type-id}}` — types in `src/engine/constants/text-block-presets.ts`
- Declension: Petrovich via `src/engine/glossary/declension-ru.ts`

## Logging

- Use `log` from `src/engine/logger.js` — not `req.log` (wraps app `logger`; see `logging.mdc`)
