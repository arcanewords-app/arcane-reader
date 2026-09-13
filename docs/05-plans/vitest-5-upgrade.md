---
type: plan
status: archived
domain: testing
stale: false
created: 2026-09-13
updated: 2026-09-13
canonical: .cursor/skills/dependency-maintenance/SKILL.md
---

# vitest 4.0.8 → 5 (archived)

Shipped 2026-09-13. Exact pin: `vitest@5.0.0` + `@vitest/coverage-v8@5.0.0` (no `^`). Skipped optional 4.1.11 — GHSA-82fw-gwwq-j7x9 is patched in 5.0.0.

Windows wrappers (`scripts/test-*.mjs`, explicit file lists, `maxWorkers: 2`, no integration `setupFiles`) **kept** until Windows + Node 24 proof. `clearMocks` stays at the v5 default (`true`). Coverage dirs unchanged (`./coverage`, `./coverage-component`, `./coverage-contract`); `.vitest/` gitignored.

Pyramid + `test:coverage` green on macOS Node 24.10. Stryker 10 vitest-runner dry-run succeeded against Vitest 5 (`npx stryker run --mutate src/engine/glossary/glossary-filter.ts`; incremental reused 145 mutants). Follow-up: Windows glob/dir, `setupFiles`, unbounded forks, `test:watch` via wrapper.

## References

- [[05-plans/testing-baseline]]
- [[05-plans/testing-strategy]]
- [[05-plans/coverage-campaign-extracts]] — extract smokes + ReportsModal hang after the bump
- [[02-how-to/dependency-audit-baseline]]
- [[05-plans/dependency-major-backlog]]
