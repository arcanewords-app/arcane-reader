---
type: explanation
status: active
domain: engine
stale: false
canonical: .cursor/rules/engine.mdc
created: 2026-05-31
updated: 2026-05-31
---

# Engine glossary and prompts (as-is)

Glossary management, prompt factories, Text Blocks, and paragraph markers inside `src/engine/`. Pipeline orchestration: [[engine-pipeline]]. Server-side marker injection and sync: [[engine-integration-boundary]].

## Glossary

### GlossaryManager (`src/engine/glossary/glossary-manager.ts`)

In-memory CRUD on `AgentContext.glossary`:

- `addCharacter`, `addLocation`, `addTerm` — with dedup by original name/term
- Character declension on add: Latin originals use EN transliteration; CJK uses `translatedName` from analyze/DB (no EN transliteration on reload — see `engine-integration.ts`)
- `toPromptSection(compact?)` — formats glossary for LLM (compact omits descriptions to save tokens)

DB persistence is **outside** engine (server writes via Supabase after pipeline).

### Analyzer prose language (all pairs)

Stage 1 uses `buildGlossaryMetadataLanguageRule` from `src/engine/prompts/shared/glossary-metadata-language.ts` (appended to system prompt in `stage-1-analyze.ts` and in `analyzer-user.ts` Rules). JSON schema labels come from `buildAnalysisJsonOutputFormat(targetLanguageLabel)`.

- **Source script:** `name`, `term`, `originalName`, `originalTerm` — as in the chapter.
- **Target language:** `description`, `context`, `updated*.description`, `chapterSummary`, `keyEvents`, `mood`, `styleNotes`, and `suggestedTranslation` when the target uses Cyrillic.

MVP target is always `ru`; the rule is parameterized via `languageDisplayName(target)` for future targets.

### Filtering

| Function                                           | When used                                                                                                   |
| -------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `filterGlossaryByChapter(glossary, chapterNumber)` | Before translate/edit — entries with `mentionedInChapters` including chapter, or empty (legacy include-all) |
| `filterGlossaryForChunk(glossary, chunkText)`      | Per chunk — whole-word match on original names/terms (+ character aliases)                                  |

Pipeline applies chapter filter first, then chunk filter in Stage 2 and Stage 3.

### Declension

| Module                      | Role                                                                           |
| --------------------------- | ------------------------------------------------------------------------------ |
| `glossary/declension.ts`    | EN names: `declineName`, `translateName`, transliteration helpers              |
| `glossary/declension-ru.ts` | RU: Petrovich via `declineNameRu`, `translateAndDeclineName`, gender detection |

DB columns use snake_case: `gender`, `location_type`, `term_category` (see `@src/storage/database.ts`).

## System prompts (`src/engine/prompts/`)

Stages call **`resolvePrompts(stage, source, target)`** from `registry.ts` — do not import pair modules directly.

### Per language pair

| Path                                                                  | Role                                          |
| --------------------------------------------------------------------- | --------------------------------------------- |
| `pairs/en-ru/analyzer.ts`, `translator.ts`                            | English → Russian                             |
| `pairs/ko-ru/analyzer.ts`, `translator.ts`                            | Korean → Russian                              |
| `pairs/zh-ru/analyzer.ts`, `translator.ts`                            | Chinese → Russian                             |
| `shared/analysis-output.ts`, `analyzer-user.ts`, `translator-user.ts` | Identical JSON schema / user prompt builders  |
| `system/editor.ts`                                                    | Russian target editor (single target for MVP) |

MVP whitelist: `src/engine/language.ts` (`en` \| `ko` \| `zh` → `ru`). **Japanese (`ja`)** — Phase 2: add `pairs/ja-ru/` + registry entry after ko/zh baseline (see [[../05-plans/engine-cjk-ru-spike]]).

Legacy exports `ANALYZER_SYSTEM_PROMPT`, `createAnalyzerPrompt`, etc. re-export **en-ru** via `registry.ts`.

### Editor presets

- **`editingStylePreset`:** `default` \| `literary` \| `minimal` \| `ai_revivification` — selects system prompt variant via `getEditorSystemPrompt`.
- **`editingFocus`:** `fix_problems` \| `style_only` \| `both`.

Passed through `PipelineOptions` from project settings (`engine-integration.ts`).

### Custom instructions

`PipelineOptions.customInstructions?: { translation?: string; editing?: string }` — appended in prompt builders when set on project.

## Text Blocks

Special content (system messages, notes, notifications) uses **markers**, not raw HTML.

### Format

```text
{{block:type-id}}content here{{/block:type-id}}
```

### Types

- Presets: `src/engine/constants/text-block-presets.ts` — `DEFAULT_TEXT_BLOCK_TYPES` (`system-message`, `note`, `notification`, …).
- Project override: `project.settings.textBlockTypes` (enabled types passed as `PipelineOptions.textBlockTypes`).

### Utilities (`src/engine/utils/text-blocks.ts`)

- `validateBlockMarkers` — ensure open/close pairs match
- `stripBlockMarkers` — export/read paths
- Paragraph merge helper when blocks span multiple paragraphs

Translator prompt documents block rules; editor prompt requires preserving block markers exactly.

**Not exported** from `src/engine/index.ts` — import paths used by `src/services/export/`.

## Paragraph markers

Cross-cutting contract between engine prompts and server sync.

### Format

```text
--para:{paragraphId}--{paragraph text}
```

### Engine (prompts + Stage 2)

- **Translator prompt** (`translator.ts`): instructs JSON output with `id` matching `--para:...--` when markers present in source.
- **Editor prompt** (`editor.ts`): must preserve markers exactly.
- **Stage 2** (`stage-2-translate.ts`): if JSON `paragraphs[].id` matches `/^--para:[^-]+--$/`, reassembles translated text with markers for downstream sync.

### Server (injection + parse)

Engine does **not** inject markers. Server does before pipeline:

- `addParagraphMarkers` in `performTranslation` — maps split `\n\n` text to DB paragraph ids
- `buildMarkedTextFromParagraphs` — rebuilds marked text for editing-only phase
- `parseEditedTextByMarkers` / `syncEditedMarkersToParagraphs` — after Stage 3

See [[engine-integration-boundary#Paragraph sync]].

### Open improvement

Stage 3 still chunks **translated text only** without guaranteed marker-safe boundaries. Server marker path helps reassembly; chunk alignment is tracked in [[05-plans/engine-pipeline-improvements]].

## Anti-patterns

- Raw HTML instead of Text Block markers in translated content
- Full glossary on every chunk (always filter)
- Inlining system prompts in `stages/*.ts`
- `console.*` in engine (use `log` from `src/engine/logger.js`)

## Related

- [[engine-pipeline]]
- [[engine-integration-boundary]]
- [[../_canonical/rules/engine]]
