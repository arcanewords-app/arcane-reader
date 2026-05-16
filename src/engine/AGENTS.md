# Engine — nested agent context

Applies when editing `src/engine/**`. Global rules: `.cursor/rules/engine.mdc`, profile [`.cursor/agents/engine/AGENT.md`](../../.cursor/agents/engine/AGENT.md), skill [`.cursor/skills/engine/SKILL.md`](../../.cursor/skills/engine/SKILL.md).

## Pipeline

- **Stages:** Analyze → Translate → Edit (`src/engine/stages/`)
- **Output:** each stage returns `StageResult` per existing patterns
- **Persistence:** caller (server/worker) saves results — no HTTP/DB in engine code

## Prompts

- Use `createAnalyzerPrompt`, `createTranslatorPrompt`, `createEditorPrompt` from `src/engine/prompts/system/`
- Do not inline large system prompts in stage files

## Glossary & Text Blocks

- Inject glossary via `filterGlossaryForChunk` where applicable
- **Text Blocks:** `{{block:type-id}}content{{/block:type-id}}` — types in `src/engine/constants/text-block-presets.ts`
- Declension: Petrovich via `src/engine/glossary/`

## Logging

- Use `logger` from engine — not `req.log` (see `logging.mdc`)
