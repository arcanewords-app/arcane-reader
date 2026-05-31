---
type: explanation
status: active
domain: engine
stale: false
canonical: .cursor/rules/engine.mdc
created: 2026-05-31
updated: 2026-05-31
---

# Engine pipeline (as-is)

Arcane Engine orchestrates a **3-stage** translation pipeline inside `src/engine/`. This note describes current behavior before refactor. For glossary/prompts see [[engine-glossary-and-prompts]]; for server persistence and E2E see [[engine-integration-boundary]].

**Do not trust** `docs/archive/TRANSLATION_*.md` or `ENGINE_E2E.md` without verifying against `src/`.

## Module map

| Path                                          | Responsibility                                     |
| --------------------------------------------- | -------------------------------------------------- |
| `src/engine/pipeline/translation-pipeline.ts` | `TranslationPipeline` — stage orchestration        |
| `src/engine/stages/stage-1-analyze.ts`        | `AnalyzeStage`                                     |
| `src/engine/stages/stage-2-translate.ts`      | `TranslateStage`                                   |
| `src/engine/stages/stage-3-edit.ts`           | `EditStage`                                        |
| `src/engine/agents/novel-agent.ts`            | In-memory project context, glossary state          |
| `src/engine/utils/chunker.ts`                 | `chunkText`, `mergeChunks`, `splitIntoSections`    |
| `src/engine/types/pipeline.ts`                | `PipelineOptions`, `PipelineResult`, `StageResult` |
| `src/engine/providers/openai.ts`              | `OpenAIProvider` (`ILLMProvider`)                  |
| `src/engine/index.ts`                         | Public barrel exports                              |

## Stage flow

```mermaid
flowchart LR
  subgraph S1[Stage1_Analyze]
    A[sourceText] --> AS[AnalyzeStage]
    AS -->|completeJSON| AR[AnalysisResult]
    AR --> NA[NovelAgent.applyAnalysisResult]
  end
  subgraph S2[Stage2_Translate]
    CTX[AgentContext] --> TS[TranslateStage]
    TS -->|chunkText| TD[TranslationDraft]
  end
  subgraph S3[Stage3_Edit]
    TD --> ES[EditStage]
    ES --> ET[EditedTranslation.finalText]
  end
  NA --> CTX
  ET --> PR[PipelineResult.finalTranslation]
```

### Stage 1 — Analyze

- **Input:** chapter `sourceText`, `chapterNumber`, optional `existingGlossary`.
- **LLM:** `completeJSON` via `createAnalyzerPrompt`.
- **Long chapters:** `splitIntoSections` when `analysisMaxSectionTokens` exceeded (default 8000; `0` disables).
- **Output:** `AnalysisResult` — characters, locations, terms, style notes, chapter summary, key events, `glossaryUpdate`.
- **Side effect:** `NovelAgent.applyAnalysisResult` updates agent state (not persisted until server saves).

### Stage 2 — Translate

- **Input:** `sourceText` + `AgentContext` (glossary filtered by chapter, then per chunk).
- **Chunking:** `chunkText` with `maxTokens` = `chunkSize` (see matrix below), `preserveParagraphs: true`, `neverSplitParagraphs` (default true).
- **LLM:** primary JSON `{ paragraphs: [{ id, translated }] }`; fallback plain text with `\n\n`.
- **Para markers:** if model returns ids matching `--para:...--`, text is reassembled with markers preserved (see [[engine-glossary-and-prompts#Paragraph markers]]).
- **Retries:** per-chunk retry (`chunkRetryAttempts` default 2, delay 1500 ms).
- **Parallelism:** `parallelChunks` (default 1 = sequential).
- **Output:** `TranslationDraft` — `translatedText`, `chunkResults[]`.

### Stage 3 — Edit

- **Input:** `stage2.translatedText` + original `sourceText` (original used for context in prompts, not sent as chunk pairs).
- **Chunking:** `chunkText(translatedText only)` — **independent** boundaries from Stage 2.
- **Glossary:** optional per-chunk via `filterGlossaryForChunk`.
- **Quality check:** optional `completeJSON` after chunked edit (`checkQualityForChunked`, default false).
- **On failure:** pipeline uses raw Stage 2 translation as `finalTranslation`.
- **Known limitation:** Stage 3 chunk boundaries are not aligned with Stage 2 chunk boundaries. Open work: [[05-plans/engine-pipeline-improvements]].

## TranslationPipeline API

| Method                                                  | Purpose                                    |
| ------------------------------------------------------- | ------------------------------------------ |
| `translateChapter(sourceText, chapterNumber, options?)` | Full or partial pipeline for one chapter   |
| `translateChapters(chapters[], options?)`               | Sequential multi-chapter                   |
| `analyzeChaptersParallel(chapters[], options?)`         | Analysis-only batch; default concurrency 4 |

### PipelineConfig

- **Legacy:** single `provider` for all stages.
- **Current:** `providers: { analysis, translation, editing }` — each must implement `complete`; analysis needs `completeJSON`; editing needs `complete` (quality check needs `completeJSON` or check is skipped).
- **Agent:** `NovelAgent` instance (cached per project in integration layer).

### Stage selection (`PipelineOptions`)

| Option                                                    | Behavior                                                                                                   |
| --------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `runStages: ('analysis' \| 'translation' \| 'editing')[]` | Run only listed stages in order                                                                            |
| `runOnlyStage`                                            | Legacy single-stage shortcut                                                                               |
| `skipAnalysis` / `skipEditing`                            | Skip when not using `runStages`                                                                            |
| `existingTranslatedTextForEdit`                           | Required for editing-only paths                                                                            |
| `isCancelled?: () => boolean`                             | Throws `'Cancelled'` between stages/chunks; after Stage 1 may return `cancelled: true` on `PipelineResult` |
| `onProgress?(done, total, stage?)`                        | Chunk progress for UI/jobs                                                                                 |

**Analysis-only:** returns empty `finalTranslation`; server saves glossary and sets `analyzed`.

**Editing-only:** uses `existingTranslatedTextForEdit`; dummy Stage 1/2 in result.

## Chunk size matrix (pipeline defaults)

Constants in `translation-pipeline.ts`:

| Scenario                              | Translation chunk                     | Glossary in translate          | Edit chunk | Glossary in edit |
| ------------------------------------- | ------------------------------------- | ------------------------------ | ---------- | ---------------- |
| Translate only (no Stage 3)           | 2000                                  | yes (default)                  | —          | —                |
| Full pipeline (translate + edit)      | 3500                                  | **no** (terms aligned in edit) | 2000       | yes (default)    |
| `includeGlossaryInTranslation: false` | 3500                                  | no                             | —          | —                |
| `includeGlossaryInEditing: false`     | —                                     | —                              | 3500       | no               |
| `chunkSize` override                  | replaces defaults for affected stages |                                |            |                  |

App config also sets `maxTokensPerChunk`, `neverSplitParagraphs`, `parallelChunks` via `engine-integration.ts` → `PipelineOptions`.

## Chunker behavior (`utils/chunker.ts`)

- **Token estimate:** tiktoken `cl100k_base` when available; else heuristic (~4 chars/token Latin, ~1 CJK).
- **Paragraph mode:** split on `\n\n+`, merge paragraphs into chunks under `maxTokens`.
- **`neverSplitParagraphs` (default true):** oversized paragraph stays one chunk (may exceed `maxTokens`); legacy sentence-split only when explicitly false.
- **`separatorAfter`:** preserved on chunks for accurate `mergeChunks`.

## PipelineResult

Returned by `translateChapter`:

- `stage1`, `stage2`, `stage3`: each `StageResult<T>` with `tokensUsed`, `duration`, `success`, `error?`.
- `finalTranslation`: text after last successful stage.
- `updatedContext`: `AgentContext` for glossary merge on server.
- `cancelled?`: true when user cancelled after Stage 1 (server should save glossary, not full translation).

## Public exports vs internal

**Exported from `src/engine/index.ts`:** pipeline, stages, agent, glossary helpers, declension, chunker utils, prompts, error constants, types.

**Not in index (used by export services):**

- `src/engine/utils/text-blocks.ts`
- `src/engine/constants/text-block-presets.ts`

## Logging

Engine code uses `log` from `src/engine/logger.js` (wrapper over app Pino `logger`). English messages only. See [[../_canonical/rules/logging]].

## Related

- [[translation-pipeline]] — index to engine docs
- [[engine-glossary-and-prompts]]
- [[engine-integration-boundary]]
- [[../02-how-to/debug-translation]]
- [[../05-plans/engine-pipeline-improvements]]
- Canonical rule: [[../_canonical/rules/engine]]
