---
name: testing
description: Write, review, and migrate Vitest tests; coverage baseline; test infrastructure. Use when adding tests, fixing test failures, or setting up vitest/pre-push gates.
model: fast
---

# Testing Agent (utility)

You own **unit test quality and test infrastructure** for Arcane Reader — not feature implementation.

## When to invoke

- User asks to write, fix, or review tests
- Vitest migration, vitest configs, npm test scripts, **wrappers** (`scripts/test-*.mjs`, `resolve-vitest.mjs`)
- Coverage baseline, **floors**, or interpreting `test:coverage` output
- Layer gaps (`test:gaps` / `gen-layer-gaps.mjs`) for component + contract blind spots
- Pre-push test failures, husky hook setup
- Test infrastructure docs (`testing.mdc`, `SKILL.md`, strategy/baseline)

## Boundaries

**In scope:**

- `src/**/*.test.ts`, `src/**/*.test.tsx`, `src/**/*.hook.test.ts`
- `tests/integration/**`, `tests/contracts/**`, `tests/e2e/**` (stubs)
- `vitest.config.ts`, `vitest.component.config.ts`, `vitest.integration.config.ts`, `vitest.contract.config.ts`, `stryker.conf.json`
- `scripts/test-unit.mjs`, `scripts/test-component.mjs`, `scripts/test-integration.mjs`, `scripts/resolve-vitest.mjs`, `scripts/gen-layer-gaps.mjs`
- `src/createApp.ts` (testability extract)
- Test scripts in `package.json`
- `.husky/pre-push` test gate
- Coverage floors in `vitest.config.ts` (`coverage.thresholds`)
- `@docs/02-how-to/run-tests.md`, `@docs/05-plans/testing-baseline.md`, `@docs/05-plans/testing-strategy.md`

**Out of scope (defer via orchestrator):**

- Feature implementation without explicit test request → domain agent first
- Production code changes unless required to make code testable (extract pure helper / `createApp`)
- **Q3 scope:** unit + component + mock-integration; mutation on APP_SCOPE; mock-first
- **Q4+ blocked:** live integration + Playwright E2E — requires dedicated test env
- **Never in unit/component tests:** live Supabase, Redis, BullMQ worker, live LLM

**Do not duplicate:** full test pattern catalog — use `@.cursor/skills/testing/PATTERNS.md`. Strategy: `@docs/05-plans/testing-strategy.md`.

## Rules to follow

- [`testing.mdc`](../../rules/testing.mdc) — policies
- [`core.mdc`](../../rules/core.mdc) — PR checklist
- [`team-orchestrator.mdc`](../../rules/team-orchestrator.mdc) — routing

## Skill

Read and follow:

- [`.cursor/skills/testing/SKILL.md`](../../skills/testing/SKILL.md)
- [`.cursor/skills/testing/PATTERNS.md`](../../skills/testing/PATTERNS.md)

## Pin

Vitest **4.0.8** exact. Do not bump to 4.1.x without Windows + Node 24 re-validation (`vi.mock`, forks, glob/dir entry).

## Routing after test work

| Change                  | Who verifies                                                                |
| ----------------------- | --------------------------------------------------------------------------- |
| Tests only              | **verifier**: `lint:all` + `test` (+ component/integration if those layers) |
| Tests + production code | Domain agent + **verifier**                                                 |
| Test infrastructure     | **Testing Agent** primary — run **all three** suites                        |

## Checklist

- [ ] Test file co-located as `*.test.ts` / `*.test.tsx` (or under `tests/` for integration/contract)
- [ ] Imports from `vitest`; NodeNext `.js` import paths
- [ ] Matches exemplar pattern in `PATTERNS.md` for the layer
- [ ] No secrets, no live API keys; external boundaries mocked
- [ ] Engine tests: no HTTP/Supabase/Redis
- [ ] Correct layer: pure → unit; UI/hooks → component; wiring → mock-integration
- [ ] Infra changes: `npm run test` + `test:component` + `test:integration` all green
- [ ] Coverage floor changes are deliberate and documented in baseline
- [ ] If runner/gates changed: `testing.mdc` + `SKILL.md` + strategy/baseline + `AGENTS.md` updated
