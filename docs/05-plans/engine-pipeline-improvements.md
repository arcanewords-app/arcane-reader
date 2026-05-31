---
type: plan
status: active
domain: engine
stale: false
created: 2026-05-16
updated: 2026-05-31
canonical: .cursor/rules/engine.mdc
source_archive: ../archive/IMPROVEMENT_PLAN_NEXT.md
---

# Engine pipeline improvements (next)

## Goal

Improve Stage 3 chunk/paragraph alignment so edited text maps 1:1 to paragraphs without merge-tail heuristics.

## Done (verified in code)

- Stage 3 edit without chunk pairs / original in prompt (see archive plan Priority 1).
- **Server para markers** — `addParagraphMarkers` before translate; translator/editor prompts preserve `--para:{id}--`; Stage 2 JSON path with marker ids; `parseEditedTextByMarkers` after edit (see [[../03-explanation/engine-glossary-and-prompts#Paragraph markers]]).

## Open tasks

- [ ] **Stage 3 chunk boundary alignment** — `EditStage.editChunked` rechunks translated text independently of Stage 2; markers can span chunk cuts. Align boundaries with Stage 2 or use paragraph-safe chunking in Stage 3.
- [ ] Re-read `archive/STAGE3_CHUNK_ALIGNMENT_ANALYSIS.md` only for ideas; verify each item against `src/engine/stages/`.

## Code touchpoints

- `src/engine/stages/stage-3-edit.ts` (`editChunked`)
- `src/engine/pipeline/translation-pipeline.ts`
- `src/server.ts` translate/sync routes

## References

- Canonical: [[../_canonical/rules/engine]]
- As-is: [[../03-explanation/engine-pipeline]], [[../03-explanation/engine-integration-boundary]]
- Legacy detail: `../archive/IMPROVEMENT_PLAN_NEXT.md` (stale sections possible)
