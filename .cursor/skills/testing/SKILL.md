---
name: testing
description: Vitest Q3 pyramid for Arcane Reader — unit, component, mock-integration, contract; local Playwright E2E; coverage floors, layer gaps, mocking, pre-push and GitHub Actions gates. Use when writing, reviewing, or migrating tests.
paths: '**/*.test.ts,**/*.test.tsx,vitest.config.ts,vitest.component.config.ts,vitest.integration.config.ts,vitest.contract.config.ts,stryker.conf.json,tests/**'
---

# Testing Skill

## When To Use

- Writing or reviewing tests at **any** Q3 layer (unit / component / mock-integration / contract)
- Local Playwright E2E (`tests/e2e/**`) against the Docker stamp
- Migrating from `node:test` to Vitest
- Fixing pre-push or GitHub Actions test failures
- Running or interpreting coverage (`npm run test:coverage`) or layer gaps (`npm run test:gaps`)
- Setting up test infrastructure (vitest configs, husky hooks, GitHub Actions, wrappers)

Read `@.cursor/rules/testing.mdc` for policies. Pyramid: `@docs/05-plans/testing-strategy.md`. Layer recipes: `PATTERNS.md` in this folder.

## Choose the layer first

Do **not** default to unit. Pick layer(s) from the change:

| Change                                                                                   | Add / update                                                               |
| ---------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| Pure logic `engine/` `shared/` utils / extracted helpers                                 | Co-located `*.test.ts` (`npm run test`)                                    |
| Preact component / hook / page                                                           | `*.test.tsx` / `*.hook.test.ts` (`npm run test:component`) — page smoke OK |
| New/changed Express route wiring                                                         | `tests/integration/api/*.test.ts` (`npm run test:integration`)             |
| Client↔server enum / critical request shape **not** already covered by thorough Zod unit | `tests/contracts/**` (`npm run test:contract`)                             |
| Deferred monster / `ProjectInfo`                                                         | Extract + unit; **do not** full-mount                                      |
| Role happy-path on the **local stamp** (not a substitute for the rows above)             | `tests/e2e/specs/*.spec.ts` (`npm run test:e2e`) — Testing utility         |

- Domain agents own these tests with feature work. Testing agent owns infra, cross-layer campaigns, and **E2E**. Domain agents do **not** have to add Playwright with every feature.
- **Do not** replace a missing component/mock-integration test with an E2E spec.
- Contract is **selective** — do not mirror every Zod schema that already has unit coverage.
- Ambiguous “add tests” for UI → run/suggest `npm run test:gaps`, then pick from CLIENT_SCOPE gaps.
- Exemplars: page-smoke / Header / Sidebar / ChapterHeader → `PATTERNS.md` § Client; integration → `PATTERNS.md` § Integration.

## Commands

| Task               | Command                                                                                |
| ------------------ | -------------------------------------------------------------------------------------- |
| Run fast tests     | `npm run test` (via `scripts/test-unit.mjs`)                                           |
| Run slow tests     | `npm run test:slow`                                                                    |
| Component suite    | `npm run test:component` (`scripts/test-component.mjs`)                                |
| Component coverage | `npm run test:component:coverage` → `coverage-component/` (CLIENT_SCOPE)               |
| Mock-integration   | `npm run test:integration` (`scripts/test-integration.mjs`)                            |
| Contract suite     | `npm run test:contract`                                                                |
| Contract coverage  | `npm run test:contract:coverage` → `coverage-contract/` (advisory)                     |
| Layer gaps         | `npm run test:gaps` (component presence+v8 + contract schema inventory)                |
| E2E (local stamp)  | `npm run test:e2e` (needs `stack:up` + `dev`; Chromium; no `@llm` / `@visual`)         |
| E2E visual shells  | `npm run test:e2e:visual` (clean AuthorPlus: `stack:restore` first, not `stack:load`)  |
| E2E visual refresh | `npm run test:e2e:update-snapshots`                                                    |
| E2E + live LLM     | `npm run test:e2e:llm` (needs `OPENAI_API_KEY`; tagged `@llm`)                         |
| Install Chromium   | `npm run playwright:install`                                                           |
| Run full suite     | `npm run test:all`                                                                     |
| Watch mode         | `npm run test:watch`                                                                   |
| Coverage report    | `npm run test:coverage` (floors: lines 77 / branches 65)                               |
| Mutation (smoke)   | `npx stryker run --mutate src/engine/glossary/glossary-filter.ts`                      |
| Mutation (full)    | `npm run test:mutation` (APP_SCOPE; manual/nightly; hours)                             |
| Mutation (zone)    | `npx stryker run --mutate "src/shared/**/*.ts"`                                        |
| Inventory          | `node scripts/gen-test-inventory.mjs` (after `test:coverage`)                          |
| Focused run        | `npm run test -- src/engine/glossary`                                                  |
| Single file        | `npm run test -- src/shared/paragraphSync.test.ts`                                     |
| Pre-push gate      | `lint:all` + `test` + `test:component` + `test:integration` + `test:contract`          |
| GitHub Actions     | `lint:all` + `test:coverage` + `test:component` + `test:integration` + `test:contract` |

**Emergency bypass** (document reason): `HUSKY=0 git push`

Husky hooks source `.husky/load-node.sh` before `npx`/`npm`. GUI Git (Cursor Source Control) does not load `~/.zshrc`, so nvm is otherwise missing and pre-commit fails with `npx: command not found`.

## Pin and Windows notes

- Vitest / `@vitest/coverage-v8` pinned exact **`5.0.0`**. Keep Windows wrappers until Windows + Node 24 proof (`vi.mock`, forks, glob/dir entry, `setupFiles`).
- Playwright `@playwright/test` **1.63.0** exact. Chromium only (`npm run playwright:install`).
- Wrappers normalize cwd via `realpathSync.native` (avoids `f:` vs `F:` → “No test suite found”).
- Component/integration wrappers pass **explicit file lists** (directory/glob entry flaky on Windows).
- Integration: `pool: 'forks'`, **no** Vitest `setupFiles` — env isolation via imported `tests/integration/setup.ts`.
- Stryker + TypeScript 7: `stryker.conf.json` `ignorePatterns` includes `tsconfig.json` (Stryker 10 `TSConfigPreprocessor` still calls `parseConfigFileTextToJson`; [stryker-js#6111](https://github.com/stryker-mutator/stryker-js/issues/6111)). Do not drop that pattern until Stryker ships the jsonc-parser fix. Babel 8 wants Node `>=24.11`; on 24.10 use `npm install --engine-strict=false`.
- Stryker mutate is `src/**/*.ts` minus `*.test.ts` / `*.test.tsx` / `*.hook.test.ts` and lab apps. **`.tsx` is not mutated.** `vitest.related: false` means even smoke (`--mutate` one file) runs the full unit dry-run first. JSON report: `reports/mutation/mutation.json`.

## File template (unit)

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
- Component: `Foo.tsx` → `Foo.test.tsx` (happy-dom); hooks → `*.hook.test.ts` — see `PATTERNS.md` § Client
- Integration: `tests/integration/api/<route>.test.ts` — see `PATTERNS.md` § Integration
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
- **Match mock async to the real signature.** `mockResolvedValue` / `mockRejectedValue` only if production returns a `Promise`. Sync helpers (`getAgentForProject` → `NovelAgent`) use `mockReturnValue` / `mockReturnValueOnce`. Do **not** keep `await` or `await Promise.resolve(...)` in production just so a Promise mock still unwraps — oxlint `typescript/await-thenable` will flag `await` on a non-Promise, and `Promise.resolve` is a lint workaround, not a fix.

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

- **Q3 2026:** unit + component + mock-integration + contract (pre-push and GitHub Actions) + **local Playwright E2E** against the Docker stamp. Mutation on APP_SCOPE (manual).
- **Q4 2026:** dedicated CI live stack still blocked (live `tests/integration/supabase/`, Playwright as merge gate). Never E2E against prod/staging.

Live Supabase / Redis / BullMQ in **unit/component** tests: **never**. Local E2E: stamp image + seed personas. Isolation between dirty runs: `npm run stack:restore` — **not** `stack:load` when `arcane-reader-stamp:latest` exists. `stack:load` + `stack:stamp` only when rebuilding the image (new dump / `STACK_STAMP=0`). Visual shells need a clean AuthorPlus workspace — restore before `test:e2e:visual` if logic specs already created a project. Live OpenAI: **only** `@llm`.

## Layer quick reference

| Layer            | Exemplar                                        | See                         |
| ---------------- | ----------------------------------------------- | --------------------------- |
| Engine glossary  | `glossary-filter.test.ts`                       | `PATTERNS.md` § Engine      |
| Engine pipeline  | `resolve-execution-options.test.ts`             | `PATTERNS.md` § Engine      |
| Shared utils     | `paragraphSync.test.ts`                         | `PATTERNS.md` § Shared      |
| API helpers      | `validateRoute.test.ts`                         | `PATTERNS.md` § API         |
| Client utils     | `urlRoutes.test.ts`                             | `PATTERNS.md` § Client      |
| Components       | `RequireRole.test.tsx`, gates                   | `PATTERNS.md` § Client      |
| Mock-integration | `tests/integration/api/status.test.ts`          | `PATTERNS.md` § Integration |
| Local E2E        | `tests/e2e/specs/guest.browses-catalog.spec.ts` | `PATTERNS.md` § E2E         |

## Gate table

| Gate             | Command                    | When                                                                                       |
| ---------------- | -------------------------- | ------------------------------------------------------------------------------------------ |
| Lint + types     | `npm run lint:all`         | pre-push + GitHub Actions                                                                  |
| Unit             | `npm run test`             | pre-push                                                                                   |
| Coverage floors  | `npm run test:coverage`    | GitHub Actions (lines 77 / branches 65); **not** pre-push                                  |
| Component        | `npm run test:component`   | pre-push + GitHub Actions                                                                  |
| Mock-integration | `npm run test:integration` | pre-push + GitHub Actions                                                                  |
| Contract         | `npm run test:contract`    | pre-push + GitHub Actions                                                                  |
| Layer gaps       | `npm run test:gaps`        | manual — find untested UI / missing contract fixtures                                      |
| Local E2E        | `npm run test:e2e`         | after `stack:up` + `dev`; dirty reset = `stack:restore`; **not** pre-push / GitHub Actions |
| Stryker          | `npm run test:mutation`    | manual/nightly; `break: null`; `tsconfig.json` ignored until [stryker-js#6111](https://github.com/stryker-mutator/stryker-js/issues/6111) |

## Anti-patterns

- Live LLM or Supabase calls in unit/component tests
- Tests without assertions
- Duplicating large prompt strings without referencing production factories (`createEditorPrompt`, `resolvePrompts`)
- Adding test cases as `scripts/test-*.ts` instead of `src/**/*.test.ts` or `tests/`
- Substituting unit for mock-integration wiring (or vice versa)
- Component tests without `@testing-library/preact` + mocked API
- Live Supabase, Redis, or BullMQ in Q3 automated tests
- E2E against staging/prod as CI gate
- Resetting a dirty local stamp with `stack:load` when `arcane-reader-stamp:latest` exists — use `stack:restore`
- Mocking the live stamp with Playwright `page.route` in `tests/e2e` v1
- Silent lowering of coverage floors

## Vitest config SSOT

| Config                         | Role                                                                 |
| ------------------------------ | -------------------------------------------------------------------- |
| `vitest.config.ts`             | Fast unit suite + coverage APP_SCOPE + floors (77/65)                |
| `vitest.slow.config.ts`        | Tiktoken-heavy engine tests                                          |
| `vitest.component.config.ts`   | `*.test.tsx` + `*.hook.test.ts`, happy-dom, CLIENT_SCOPE coverage    |
| `vitest.contract.config.ts`    | Zod fixtures; advisory schema coverage only                          |
| `vitest.integration.config.ts` | `tests/integration/**` (excludes live supabase until unblocked)      |
| `playwright.config.ts`         | Local E2E; `testDir: tests/e2e/specs`; Chromium; no Docker webServer |

Unit coverage: `provider: 'v8'`, reporters `text`, `html`, `json-summary`, thresholds lines **77** / branches **65**. Component/contract coverage dirs are separate (`coverage-component/`, `coverage-contract/`) — never merge into unit floors.

## Verification after changes

```bash
npm run test
npm run test:component    # when UI/hooks or infra change
npm run test:integration  # when HTTP wiring / infra change
npm run lint:all          # when production code also changed
```

For test-only PRs, **verifier** runs `lint:all` + suites for changed layers (`test` / `test:component` / `test:integration` / `test:contract`). Does **not** run `test:e2e`.

## Related

- Strategy: `@docs/05-plans/testing-strategy.md`
- Baseline: `@docs/05-plans/testing-baseline.md`
- Agent profile: `@.cursor/agents/testing/AGENT.md`
- Policy: `@.cursor/rules/testing.mdc`
- Human guide: `@docs/02-how-to/run-tests.md`
- Mutation testing (manual/nightly): `npm run test:mutation` — APP_SCOPE `src/**/*.ts` (not `.tsx`); not in CI
- TypeScript 7: `stryker.conf.json` `ignorePatterns` includes `tsconfig.json` so Stryker skips `TSConfigPreprocessor` (`parseConfigFileTextToJson` removed in TS7; [stryker-js#6111](https://github.com/stryker-mutator/stryker-js/issues/6111)). Drop the pattern when Stryker ships the jsonc-parser fix.
