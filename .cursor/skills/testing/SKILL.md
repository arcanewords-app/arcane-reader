---
name: testing
description: Vitest unit tests, mocking, coverage, and test gates for Arcane Reader. Use when writing, reviewing, or migrating tests.
paths: '**/*.test.ts,vitest.config.ts,stryker.conf.json'
---

# Testing Skill

## When To Use

- Writing or reviewing `*.test.ts` files
- Migrating from `node:test` to Vitest
- Fixing pre-push test failures
- Running or interpreting coverage (`npm run test:coverage`)
- Setting up test infrastructure (vitest config, husky hooks)

Read `@.cursor/rules/testing.mdc` for policies. Layer recipes: `PATTERNS.md` in this folder.

## Commands

| Task             | Command                                                           |
| ---------------- | ----------------------------------------------------------------- |
| Run fast tests   | `npm run test` (~12 s; excludes tiktoken slow files)              |
| Run slow tests   | `npm run test:slow` (~100 s; preview/chunking)                    |
| Run full suite   | `npm run test:all`                                                |
| Watch mode       | `npm run test:watch`                                              |
| Coverage report  | `npm run test:coverage`                                           |
| Mutation (smoke) | `npx stryker run --mutate src/engine/glossary/glossary-filter.ts` |
| Mutation (full)  | `npm run test:mutation` (APP_SCOPE; manual/nightly; hours)        |
| Mutation (zone)  | `npx stryker run --mutate "src/shared/**/*.ts"`                   |
| Inventory        | `node scripts/gen-test-inventory.mjs` (after `test:coverage`)     |
| Focused run      | `npx vitest run src/engine/glossary`                              |
| Single file      | `npx vitest run src/shared/paragraphSync.test.ts`                 |
| Pre-push gate    | `npm run lint:all && npm run test`                                |

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

Arcane has **no dedicated test environment**. Even integration, component, and system tests use mocks at external boundaries.

**Mock these boundaries:**

| Boundary           | Mock approach                                                           |
| ------------------ | ----------------------------------------------------------------------- |
| `OpenAIProvider`   | Inject fake `client.chat.completions.create` (see exemplar below)       |
| `supabaseDatabase` | `vi.mock('../services/supabaseDatabase.js')` with fixture return values |
| `redisCache`       | `vi.mock` or in-memory stub                                             |
| `fetch` / HTTP     | `vi.stubGlobal('fetch', ...)` or Playwright `page.route()`              |

**Quarter scope:**

- **Q3 2026:** mock-first unit tests + mutation on APP_SCOPE (backend + client); phased waves by folder.
- **Q4 2026+:** **live integration only** (real Supabase / Redis / worker on dedicated test stack). **Blocked** until test env exists. Mocked supertest / Playwright gates are **not** planned.

Live Supabase / Redis / BullMQ in **unit** tests: **never**. In Q4 integration tests: **only** on dedicated test environment.

## Layer quick reference

| Layer           | Exemplar                            | See                    |
| --------------- | ----------------------------------- | ---------------------- |
| Engine glossary | `glossary-filter.test.ts`           | `PATTERNS.md` § Engine |
| Engine pipeline | `resolve-execution-options.test.ts` | `PATTERNS.md` § Engine |
| Shared utils    | `paragraphSync.test.ts`             | `PATTERNS.md` § Shared |
| API helpers     | `validateRoute.test.ts`             | `PATTERNS.md` § API    |
| Client utils    | `urlRoutes.test.ts`                 | `PATTERNS.md` § Client |

## Anti-patterns

- Live LLM or Supabase calls in unit tests
- Tests without assertions
- Duplicating large prompt strings without referencing production factories (`createEditorPrompt`, `resolvePrompts`)
- Adding `scripts/test-*.ts` instead of `src/**/*.test.ts`
- Component tests without `@testing-library/preact` + mocked API (wave 3)
- Live Supabase, Redis, or BullMQ in any automated test
- E2E against staging/prod as CI gate

## Vitest config SSOT

`vitest.config.ts` at repo root:

- `include: ['src/**/*.test.ts']`
- `environment: 'node'` (default)
- Slow tiktoken tests: `npm run test:slow` (excluded from `test` and `test:coverage`)
- Coverage APP_SCOPE: `src/**/*.ts` minus `*.test.ts`, `debug-app`, `prompt-lab-app` (includes `client/**`)
- Coverage: `provider: 'v8'`, reporters `text`, `html`, `json-summary` — **no thresholds**

## Verification after changes

```bash
npm run test
npm run lint:all   # when production code also changed
```

For test-only PRs, **verifier** runs `npm run test` + `npm run lint:all`.

## Related

- Agent profile: `@.cursor/agents/testing/AGENT.md`
- Policy: `@.cursor/rules/testing.mdc`
- Human guide: `@docs/02-how-to/run-tests.md`
- Mutation testing (manual/nightly): `npm run test:mutation` — APP_SCOPE; not in CI
