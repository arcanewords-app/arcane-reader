---
type: plan
status: active
domain: engine
stale: false
created: 2026-05-16
updated: 2026-05-16
canonical: .cursor/rules/engine.mdc
source_archive: ../archive/ENGINE_REFACTOR_PLAN.md
---

# Engine refactor (remaining phases)

## Goal

Complete engine hardening from phased refactor plan: cache invalidation, cancel/resume, draft saves, chunk recovery.

## Done (per archive + code spot-check)

- [x] `neverSplitParagraphs` in chunker
- [x] Chunk retry in stage-2-translate
- [x] JSON translation response path + fallback
- [x] Agent cache clear on glossary mutations (verify handlers in `server.ts`)

## Open tasks (triage from archive — verify before starting)

- [ ] Phase 2+: cancel/resume by chunk — check `translate-jobs`, `analysis-jobs` vs archive spec
- [ ] Draft save during long translate — check current chapter status + partial saves
- [ ] Document edge cases in vault or rule when behavior is finalized

## References

- Full legacy spec: `../archive/ENGINE_REFACTOR_PLAN.md` (44 KB — do not trust blindly)
- E2E notes: `../archive/ENGINE_E2E.md`
