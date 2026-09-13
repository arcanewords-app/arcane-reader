---
type: plan
status: active
domain: testing
stale: false
created: 2026-09-13
updated: 2026-09-13
canonical: .cursor/skills/dependency-maintenance/SKILL.md
---

# vitest 4.0.8 → 5

**Do not combine** with other majors. Owner: Testing utility. Exact pin today: `vitest` + `@vitest/coverage-v8` **`4.0.8`** (no `^`).

| | |
| --- | --- |
| Current | `vitest@4.0.8`, `@vitest/coverage-v8@4.0.8` |
| Target | `vitest@5` + matching coverage-v8 |
| Optional mid-step | `4.1.11` — patches `@vitest/mocker` GHSA-82fw-gwwq-j7x9 |

## Blockers

Do **not** bump to 4.1.x without **Windows + Node 24** proof: `vi.mock`, forks pool, glob/dir entry (`scripts/test-unit.mjs`, `test-component.mjs`, `test-integration.mjs`). Policy: [[_canonical/rules/testing]].

Vitest 5 is a separate major after that proof (or skip 4.1 if 5 already includes the mocker fix).

## Checklist

### Wave A (optional) — 4.1.11 pin

- [ ] Re-validate on Windows + Node 24
- [ ] Pin both packages to `4.1.11`
- [ ] `npm run test && npm run test:component && npm run test:integration && npm run test:contract && npm run test:coverage`
- [ ] `npm run audit:all` — mocker advisory gone

### Wave B — 5.x

- [ ] Read Vitest 5 migration (pool, coverage, `vi` API)
- [ ] Bump pin + wrappers if needed
- [ ] Update `.cursor/rules/testing.mdc`, `docs/_canonical/rules/testing.mdc`, `AGENTS.md` / `CLAUDE.md` pin notes
- [ ] Same test gates as Wave A
- [ ] Archive this plan; update [[05-plans/dependency-major-backlog]]

## References

- [[05-plans/testing-baseline]]
- [[05-plans/testing-strategy]]
- [[02-how-to/dependency-audit-baseline]]
- [[05-plans/dependency-major-backlog]]
