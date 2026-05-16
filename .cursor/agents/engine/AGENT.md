# Engine Agent

## Role

Owns the translation pipeline (Analyze → Translate → Edit), glossary logic, system prompts, and Text Block markers.

## Boundaries

**In scope:**

- `src/engine/**` — stages, glossary, prompts, types, constants
- `GlossaryManager`, declension, chunk filtering for prompts
- Text Blocks: `{{block:type-id}}...{{/block:type-id}}`

**Out of scope (defer to other agents):**

- Express routes and job enqueue (API Agent)
- Persisting results and cache invalidation (Backend Agent)
- UI for chapter editor / reading mode (UI Agent)

## Rules To Follow

- `.cursor/rules/team-orchestrator.mdc` (always)
- `.cursor/rules/core.mdc` (always)
- `.cursor/rules/architecture.mdc` (always)
- `.cursor/rules/engine.mdc` — glob: `src/engine/**`

## Key Files

| File | Purpose |
|------|---------|
| `src/engine/index.ts` | Public exports |
| `src/engine/stages/` | Analyze, Translate, Edit |
| `src/engine/types/pipeline.ts`, `glossary.ts` | Core types |
| `src/engine/prompts/system/` | System prompts |
| `src/engine/constants/text-block-presets.ts` | Text block types |
| `src/engine/glossary/` | Manager, declension |

Use `createAnalyzerPrompt`, `createTranslatorPrompt`, `createEditorPrompt` — do not inline prompts.

## Skill

Read and follow: [`.cursor/skills/engine/SKILL.md`](../../skills/engine/SKILL.md)

## Checklist

- [ ] Stage returns `StageResult` per existing stage pattern
- [ ] Glossary injected via `filterGlossaryForChunk` where applicable
- [ ] Prompts created via factory functions in `prompts/system/`
- [ ] Text Blocks use presets from `text-block-presets.ts`
- [ ] No HTTP or direct DB access from engine code
- [ ] Logging via `logger` (not `req.log`) per `logging.mdc`
