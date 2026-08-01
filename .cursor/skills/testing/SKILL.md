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
- Setting up test infrastructure (vitest configs, husky hooks)
- Component, mock-integration, contract stubs

Read `@.cursor/rules/testing.mdc` for policies. Pyramid: `@docs/05-plans/testing-strategy.md`. Layer recipes: `PATTERNS.md` in this folder.

## Commands

| Task              | Command                                                           |
| ----------------- | ----------------------------------------------------------------- |
| Run fast tests    | `npm run test` (~unit; excludes tiktoken slow files)              |
| Run slow tests    | `npm run test:slow` (~100 s; preview/chunking)                    |
| Component suite   | `npm run test:component`                                          |
| Mock-integration  | `npm run test:integration`                                        |
| Contract suite    | `npm run test:contract`                                           |
| E2E (placeholder) | `npm run test:e2e`                                                |
| Run full suite    | `npm run test:all`                                                |
| Watch mode        | `npm run test:watch`                                              |
| Coverage report   | `npm run test:coverage`                                           |
| Mutation (smoke)  | `npx stryker run --mutate src/engine/glossary/glossary-filter.ts` |
| Mutation (full)   | `npm run test:mutation` (APP_SCOPE; manual/nightly; hours)        |
| Mutation (zone)   | `npx stryker run --mutate "src/shared/**/*.ts"`                   |
| Inventory         | `node scripts/gen-test-inventory.mjs` (after `test:coverage`)     |
| Focused run       | `npx vitest run src/engine/glossary`                              |
| Single file       | `npx vitest run src/shared/paragraphSync.test.ts`                 |
| Pre-push gate     | `npm run lint:all && npm run test`                                |

**Emergency bypass** (document reason): `HUSKY=0 git push`

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

## Anti-patterns

- Live LLM or Supabase calls in unit/component tests
- Tests without assertions
- Duplicating large prompt strings without referencing production factories (`createEditorPrompt`, `resolvePrompts`)
- Adding `scripts/test-*.ts` instead of `src/**/*.test.ts` or `tests/`
- Component tests without `@testing-library/preact` + mocked API
- Live Supabase, Redis, or BullMQ in Q3 automated tests
- E2E against staging/prod as CI gate

## Vitest config SSOT

| Config                         | Role                                                            |
| ------------------------------ | --------------------------------------------------------------- |
| `vitest.config.ts`             | Fast unit suite + coverage APP_SCOPE                            |
| `vitest.slow.config.ts`        | Tiktoken-heavy engine tests                                     |
| `vitest.component.config.ts`   | `*.test.tsx` + `*.hook.test.ts`, happy-dom                      |
| `vitest.integration.config.ts` | `tests/integration/**` (excludes live supabase until unblocked) |

Coverage: `provider: 'v8'`, reporters `text`, `html`, `json-summary` — **no thresholds**.

## Verification after changes

```bash
npm run test
npm run lint:all   # when production code also changed
```

For test-only PRs, **verifier** runs `npm run test` + `npm run lint:all`.
After Wave 6/7 infra changes, also run `npm run test:component` and `npm run test:integration`.

## Related

- Strategy: `@docs/05-plans/testing-strategy.md`
- Baseline: `@docs/05-plans/testing-baseline.md`
- Agent profile: `@.cursor/agents/testing/AGENT.md`
- Policy: `@.cursor/rules/testing.mdc`
- Human guide: `@docs/02-how-to/run-tests.md`
- Mutation testing (manual/nightly): `npm run test:mutation` — APP_SCOPE; not in CI
