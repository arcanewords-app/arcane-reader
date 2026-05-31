---
type: explanation
status: active
domain: engine
stale: false
canonical: .cursor/rules/engine.mdc
created: 2026-05-16
updated: 2026-05-31
---

# Translation pipeline (index)

Arcane Engine runs **Analyze → Translate → Edit**. Canonical agent rule: [[../_canonical/rules/engine]]. Do not trust `archive/TRANSLATION_*.md` without code verification.

## As-is documentation (May 2026)

| Note                            | Contents                                                                                  |
| ------------------------------- | ----------------------------------------------------------------------------------------- |
| [[engine-pipeline]]             | Stages, `TranslationPipeline`, `PipelineOptions`, chunk sizes, Stage 3 limits, public API |
| [[engine-glossary-and-prompts]] | Glossary filters, declension, prompts, Text Blocks, `--para:` markers                     |
| [[engine-integration-boundary]] | `performTranslation`, draft save, sync, cancel, worker, Supabase boundary                 |

## Quick reference

- **Stages:** `src/engine/stages/` — each returns `StageResult`
- **Orchestration:** `src/engine/pipeline/translation-pipeline.ts`
- **Integration:** `src/services/engine-integration.ts`
- **Async jobs:** BullMQ — [[../_canonical/rules/routing]] Async Jobs section
- **Debug:** [[../02-how-to/debug-translation]]

## Active plans

- [[../05-plans/engine-pipeline-improvements]] — Stage 3 chunk alignment
- [[../05-plans/engine-refactor]] — cancel/resume by chunk
