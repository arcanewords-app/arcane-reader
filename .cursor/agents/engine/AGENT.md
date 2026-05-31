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

- `.cursor/rules/team-orchestrator.mdc` (when implementing / cross-domain)
- `.cursor/rules/core.mdc` (always)
- `.cursor/rules/architecture.mdc` (always)
- `.cursor/rules/engine.mdc` — glob: `src/engine/**`

## As-is documentation

| Vault note                                           | Topic                         |
| ---------------------------------------------------- | ----------------------------- |
| `docs/03-explanation/engine-pipeline.md`             | Pipeline, stages, chunk sizes |
| `docs/03-explanation/engine-glossary-and-prompts.md` | Glossary, prompts, markers    |
| `docs/03-explanation/engine-integration-boundary.md` | Server/worker integration     |

## Key Files

| File                                          | Purpose                  |
| --------------------------------------------- | ------------------------ |
| `src/engine/index.ts`                         | Public exports           |
| `src/engine/pipeline/translation-pipeline.ts` | Orchestrator             |
| `src/engine/stages/`                          | Analyze, Translate, Edit |
| `src/engine/types/pipeline.ts`, `glossary.ts` | Core types               |
| `src/engine/prompts/system/`                  | System prompts           |
| `src/engine/constants/text-block-presets.ts`  | Text block types         |
| `src/engine/glossary/`                        | Manager, declension      |
| `src/engine/logger.ts`                        | Engine `log` helper      |

Use `createAnalyzerPrompt`, `createTranslatorPrompt`, `createEditorPrompt` — do not inline prompts.

## Skill

Read and follow: [`.cursor/skills/engine/SKILL.md`](../../skills/engine/SKILL.md)

## Checklist

- [ ] Stage returns `StageResult` per existing stage pattern
- [ ] Glossary injected via `filterGlossaryForChunk` where applicable
- [ ] Prompts created via factory functions in `prompts/system/`
- [ ] Text Blocks use presets from `text-block-presets.ts`
- [ ] No HTTP or direct DB access from engine code
- [ ] Logging via `log` from `src/engine/logger.js` (not `req.log`) per `logging.mdc`
