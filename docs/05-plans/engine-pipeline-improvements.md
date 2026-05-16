---
type: plan
status: active
domain: engine
stale: false
created: 2026-05-16
updated: 2026-05-16
canonical: .cursor/rules/engine.mdc
source_archive: ../archive/IMPROVEMENT_PLAN_NEXT.md
---

# Engine pipeline improvements (next)

## Goal

Improve Stage 3 chunk/paragraph alignment so edited text maps 1:1 to paragraphs without merge-tail heuristics.

## Done (verified in code)

- Stage 3 edit without chunk pairs / original in prompt (see archive plan Priority 1).

## Open tasks

- [ ] **Stage 3 para markers** — send `--para:{id}--` blocks to editor; parse response by id (archive: Variant A).
- [ ] **Chunk split alignment** — consistent boundaries with paragraph structure for easier reassembly.
- [ ] Re-read `archive/STAGE3_CHUNK_ALIGNMENT_ANALYSIS.md` only for ideas; verify each item against `src/engine/stages/`.

## Code touchpoints

- `src/engine/stages/` (editor stage)
- `src/services/engine-integration.ts`
- `src/server.ts` translate/sync routes

## References

- Canonical: [[../_canonical/rules/engine]]
- Explanation: [[../03-explanation/translation-pipeline]]
- Legacy detail: `../archive/IMPROVEMENT_PLAN_NEXT.md` (stale sections possible)
