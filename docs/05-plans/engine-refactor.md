---
type: plan
status: active
domain: engine
stale: false
created: 2026-05-16
updated: 2026-05-31
canonical: .cursor/rules/engine.mdc
source_archive: ../archive/ENGINE_REFACTOR_PLAN.md
---

# Engine refactor (remaining phases)

## Goal

Complete engine hardening from phased refactor plan: cache invalidation, cancel/resume, chunk recovery.

## Done (verified in code, May 2026)

- [x] `neverSplitParagraphs` in chunker
- [x] Chunk retry in stage-2-translate
- [x] JSON translation response path + fallback
- [x] Agent cache clear on glossary mutations (verify handlers in `server.ts`)
- [x] **Draft save after Stage 2** — `performTranslation` saves `status: 'draft'`, then runs editing-only pipeline phase (see [[../03-explanation/engine-integration-boundary]])

## Open tasks (triage from archive — verify before starting)

- [ ] Phase 2+: cancel/resume by chunk — check `translate-jobs`, `analysis-jobs` vs archive spec
- [ ] Document edge cases in vault or rule when behavior is finalized

## References

- As-is docs: [[../03-explanation/engine-integration-boundary]], [[../03-explanation/engine-pipeline]]
- Full legacy spec: `../archive/ENGINE_REFACTOR_PLAN.md` (44 KB — do not trust blindly)
- Superseded E2E: `../archive/ENGINE_E2E.md` → use active explanation notes
