---
name: testing
description: Vitest unit tests, mocking, coverage, and test gates for Arcane Reader. Use when writing, reviewing, or migrating tests.
paths: '**/*.test.ts,**/*.test.tsx,vitest.config.ts,vitest.component.config.ts,vitest.integration.config.ts,stryker.conf.json,tests/**'
---

# Testing Skill

## When To Use

- Writing or reviewing `*.test.ts` / `*.test.tsx` files
- Migrating from `node:test` to Vitest
- Fixing pre-push test failures
- Running or interpreting coverage (`npm run test:coverage`)
- Setting up test infrastructure (vitest configs, husky hooks, wrappers)
- Component, mock-integration, contract stubs

Read `@.cursor/rules/testing.mdc` for policies. Pyramid: `@docs/05-plans/testing-strategy.md`. Layer recipes: `PATTERNS.md` in this folder.

## Commands

| Task               | Command                                                                       |
| ------------------ | ----------------------------------------------------------------------------- |
| Run fast tests     | `npm run test` (via `scripts/test-unit.mjs`)                                  |
| Run slow tests     | `npm run test:slow`                                                           |
| Component suite    | `npm run test:component` (`scripts/test-component.mjs`)                       |
| Component coverage | `npm run test:component:coverage` → `coverage-component/` (CLIENT_SCOPE)      |
| Mock-integration   | `npm run test:integration` (`scripts/test-integration.mjs`)                   |
| Contract suite     | `npm run test:contract`                                                       |
| Contract coverage  | `npm run test:contract:coverage` → `coverage-contract/` (advisory)            |
| Layer gaps         | `npm run test:gaps` (component presence+v8 + contract schema inventory)       |
| E2E (placeholder)  | `npm run test:e2e`                                                            |
| Run full suite     | `npm run test:all`                                                            |
| Watch mode         | `npm run test:watch`                                                          |
| Coverage report    | `npm run test:coverage` (floors: lines 77 / branches 65)                      |
| Mutation (smoke)   | `npx stryker run --mutate src/engine/glossary/glossary-filter.ts`             |
| Mutation (full)    | `npm run test:mutation` (APP_SCOPE; manual/nightly; hours)                    |
| Mutation (zone)    | `npx stryker run --mutate "src/shared/**/*.ts"`                               |
| Inventory          | `node scripts/gen-test-inventory.mjs` (after `test:coverage`)                 |
| Focused run        | `npm run test -- src/engine/glossary`                                         |
| Single file        | `npm run test -- src/shared/paragraphSync.test.ts`                            |
| Pre-push gate      | `lint:all` + `test` + `test:component` + `test:integration` + `test:contract` |

**Emergency bypass** (document reason): `HUSKY=0 git push`

## Pin and Windows notes

- Vitest / `@vitest/coverage-v8` pinned exact **`4.0.8`**. Do not bump to 4.1.x without Windows + Node 24 proof (`vi.mock`, forks, glob).
- Wrappers normalize cwd via `realpathSync.native` (avoids `f:` vs `F:` → “No test suite found”).
- Component/integration wrappers pass **explicit file lists** (directory/glob entry flaky on Windows).
- Integration: `pool: 'forks'`, **no** Vitest `setupFiles` — env isolation via imported `tests/integration/setup.ts`.

## File template

```typescript
import { describe, it, expect } from 'vitest';
import { myFunction } from './myModule.js';

describe('myFunction', () => {
  it('returns expected value when input is valid', () => {
    expect(myFunction('input')).toBe('output');
  });
});
```

- Co-locate: `src/shared/foo.ts` → `src/shared/foo.test.ts`
- Use **behavior** names in `it('...')`, not internal implementation details
- Prefer `expect` from vitest; `node:assert/strict` is acceptable during migration

## Mocking

Use Vitest `vi` API. Clean up in `afterEach`:

```typescript
import { afterEach, describe, it, vi } from 'vitest';

afterEach(() => {
  vi.restoreAllMocks();
});
```

**OpenAI provider:** inject mock `client.chat.completions.create` — see `@src/engine/providers/openai.completejson.test.ts`.

**Rules:**

- Mock only external boundaries (LLM, network, DB, Redis, filesystem)
- Never use real `OPENAI_API_KEY` or Supabase credentials in tests
- Do not commit `.env` values into test fixtures

### Mock-first integration (no test env)

Arcane has **no dedicated test environment**. Unit, component, and mock-integration tests use mocks at external boundaries.

**Mock these boundaries:**

| Boundary           | Mock approach                                                           |
| ------------------ | ----------------------------------------------------------------------- |
| `OpenAIProvider`   | Inject fake `client.chat.completions.create` (see exemplar below)       |
| `supabaseDatabase` | `vi.mock('../services/supabaseDatabase.js')` with fixture return values |
| `redisCache`       | `vi.mock` or in-memory stub                                             |
| `fetch` / HTTP     | `vi.stubGlobal('fetch', ...)` or Playwright `page.route()`              |

**Quarter scope:**

- **Q3 2026:** unit + component + **mock-integration** (`createApp` + supertest) + mutation on APP_SCOPE.
- **Q4 2026+:** **live integration + E2E** (real Supabase / Redis / worker on dedicated test stack). **Blocked** until test env exists.

Live Supabase / Redis / BullMQ in **unit/component** tests: **never**. In Q4 live integration: **only** on dedicated test environment.

## Layer quick reference

| Layer            | Exemplar                               | See                         |
| ---------------- | -------------------------------------- | --------------------------- |
| Engine glossary  | `glossary-filter.test.ts`              | `PATTERNS.md` § Engine      |
| Engine pipeline  | `resolve-execution-options.test.ts`    | `PATTERNS.md` § Engine      |
| Shared utils     | `paragraphSync.test.ts`                | `PATTERNS.md` § Shared      |
| API helpers      | `validateRoute.test.ts`                | `PATTERNS.md` § API         |
| Client utils     | `urlRoutes.test.ts`                    | `PATTERNS.md` § Client      |
| Components       | `RequireRole.test.tsx`, gates          | `PATTERNS.md` § Client      |
| Mock-integration | `tests/integration/api/status.test.ts` | `PATTERNS.md` § Integration |

## Gate table

| Gate             | Command                    | When                                                  |
| ---------------- | -------------------------- | ----------------------------------------------------- |
| Lint + types     | `npm run lint:all`         | every push                                            |
| Unit             | `npm run test`             | every push                                            |
| Component        | `npm run test:component`   | every push                                            |
| Mock-integration | `npm run test:integration` | every push                                            |
| Contract         | `npm run test:contract`    | every push                                            |
| Coverage floors  | `npm run test:coverage`    | manual / PR when touching coverage; **not** pre-push  |
| Layer gaps       | `npm run test:gaps`        | manual — find untested UI / missing contract fixtures |
| Stryker          | `npm run test:mutation`    | manual/nightly; `break: null`                         |

## Anti-patterns

- Live LLM or Supabase calls in unit/component tests
- Tests without assertions
- Duplicating large prompt strings without referencing production factories (`createEditorPrompt`, `resolvePrompts`)
- Adding test cases as `scripts/test-*.ts` instead of `src/**/*.test.ts` or `tests/`
- Substituting unit for mock-integration wiring (or vice versa)
- Component tests without `@testing-library/preact` + mocked API
- Live Supabase, Redis, or BullMQ in Q3 automated tests
- E2E against staging/prod as CI gate
- Silent lowering of coverage floors

## Vitest config SSOT

| Config                         | Role                                                              |
| ------------------------------ | ----------------------------------------------------------------- |
| `vitest.config.ts`             | Fast unit suite + coverage APP_SCOPE + floors (77/65)             |
| `vitest.slow.config.ts`        | Tiktoken-heavy engine tests                                       |
| `vitest.component.config.ts`   | `*.test.tsx` + `*.hook.test.ts`, happy-dom, CLIENT_SCOPE coverage |
| `vitest.contract.config.ts`    | Zod fixtures; advisory schema coverage only                       |
| `vitest.integration.config.ts` | `tests/integration/**` (excludes live supabase until unblocked)   |

Unit coverage: `provider: 'v8'`, reporters `text`, `html`, `json-summary`, thresholds lines **77** / branches **65**. Component/contract coverage dirs are separate (`coverage-component/`, `coverage-contract/`) — never merge into unit floors.

## Verification after changes

```bash
npm run test
npm run test:component    # when UI/hooks or infra change
npm run test:integration  # when HTTP wiring / infra change
npm run lint:all          # when production code also changed
```

For test-only PRs, **verifier** runs `lint:all` + the three suite gates when infra changes.

## Related

- Strategy: `@docs/05-plans/testing-strategy.md`
- Baseline: `@docs/05-plans/testing-baseline.md`
- Agent profile: `@.cursor/agents/testing/AGENT.md`
- Policy: `@.cursor/rules/testing.mdc`
- Human guide: `@docs/02-how-to/run-tests.md`
- Mutation testing (manual/nightly): `npm run test:mutation` — APP_SCOPE; not in CI
