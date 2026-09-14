# Run tests

Unit tests use **Vitest 5.0.0** (exact pin). Policy: [[_canonical/rules/testing]]. Strategy (pyramid): [[05-plans/testing-strategy]].

Tests never require prod/staging `.env` credentials. Pre-push and GitHub Actions use mocks at all external boundaries. Local E2E uses the Docker stamp (`stack:up` restores `arcane-reader-stamp:latest`; dirty reset = `stack:restore`) + `npm run dev` — not a merge gate. First bake only: `stack:load` then `stack:stamp`. Dedicated CI live stack (Playwright-as-gate, `tests/integration/supabase/`) is still blocked. See [[05-plans/testing-baseline]].

## Commands

```bash
npm run test                 # fast unit suite (scripts/test-unit.mjs; excludes tiktoken slow tests)
npm run test:slow            # slow preview/chunking tests (~100 s)
npm run test:component       # Testing Library + happy-dom (*.test.tsx, *.hook.test.ts)
npm run test:component:coverage  # CLIENT_SCOPE v8 → coverage-component/
npm run test:integration     # mock-integration (createApp + supertest; scripts/test-integration.mjs)
npm run test:contract        # contract fixtures (Wave 9)
npm run test:contract:coverage   # advisory schema v8 → coverage-contract/
npm run test:gaps            # component + contract blind spots → reports/layer-gaps.json
npm run test:e2e             # Playwright vs stamp (not pre-push; needs stack:up + dev)
npm run test:e2e:visual      # pixel shells; restore stamp if AuthorPlus is dirty
npm run test:e2e:llm         # includes tagged @llm live translate
npm run test:all             # unit + slow + component + integration + contract
npm run test:watch           # watch mode
npm run test:coverage        # HTML + summary; floors lines 77 / branches 65 (coverage/ gitignored)
npm run test:mutation        # Stryker mutation — manual/nightly only (hours; break: null)
npx stryker run --mutate src/engine/glossary/glossary-filter.ts   # mutation smoke
npm run test -- src/engine/glossary   # focused directory (prefer npm run test over raw npx on Windows)
```

`stryker.conf.json` `ignorePatterns` includes `tsconfig.json` so the sandbox skips TypeScript 7's missing `parseConfigFileTextToJson` ([stryker-js#6111](https://github.com/stryker-mutator/stryker-js/issues/6111)). Stryker **10** instruments with Babel 8 (`engines`: Node `>=24.11` or `^22.18`). On Node 24.10, `npm install --no-workspaces --engine-strict=false` (repo `.npmrc` has `engine-strict=true`). Safe here: flat tsconfig, Vitest/esbuild. Drop the `tsconfig.json` ignore pattern when Stryker ships the jsonc-parser fix.

Mutate is `src/**/*.ts` minus `*.test.ts` / `*.test.tsx` / `*.hook.test.ts` and lab apps — **not** `.tsx` components. `vitest.related: false` means smoke still runs the full unit dry-run once. Reports: `reports/mutation/mutation.html` and `reports/mutation/mutation.json`.

## APP_SCOPE (coverage + mutation)

`vitest.config.ts` and `stryker.conf.json` share the same scope:

- **include:** `src/**/*.ts` (backend + client SPA)
- **exclude:** `*.test.ts` / `*.test.tsx` / `*.hook.test.ts`, `src/debug-app/**`, `src/prompt-lab-app/**`, `src/debug/**`, `src/prompt-lab/**`

Inventory: `node scripts/gen-test-inventory.mjs` (after coverage run).

## Layer gaps (component + contract)

Unit floors do not show UI / contract blind spots. Use:

```bash
npm run test:gaps                 # presence + v8 (component) + schema/enum inventory (contract)
npm run test:gaps -- --reuse      # reuse coverage-component/ if already generated
```

Advisory only (exit 0). See [[05-plans/testing-strategy]].

## Thresholds

| Mechanism              | Policy                                                                                                                                                |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| Vitest coverage floors | `coverage.thresholds` in `vitest.config.ts`: lines **77**, branches **65**. GitHub Actions merge gate (`npm run test:coverage`); **not** in pre-push. |
| Layer gaps             | `npm run test:gaps` — advisory report; not a merge gate                                                                                               |
| Stryker                | `high: 80`, `low: 60`, `break: null` — advisory bands; never fails the build                                                                          |

If coverage drops below floors, fix tests or lower floors **deliberately** in the same PR.

## Gates (pre-push vs CI vs local E2E)

**Pre-push** (`.husky/pre-push`) — no coverage floors, no Playwright:

```bash
npm run lint:all
npm run test
npm run test:component
npm run test:integration
npm run test:contract
```

Emergency bypass: `HUSKY=0 git push` (document why).

**GitHub Actions** (`.github/workflows/test.yml`) — same pyramid plus unit coverage floors:

```bash
npm run lint:all
npm run test:coverage
npm run test:component
npm run test:integration
npm run test:contract
```

Job Node is **24** (`.nvmrc`). A “Node.js 20 is deprecated” annotation on old `actions/*@v4` is the **action** runtime, not the test Node — current workflow uses checkout/setup-node/upload-artifact **v6** (`node24`). Pre-push does **not** run `test:coverage`; moving a unit `*.test.ts` to `*.hook.test.ts` can pass husky and fail CI floors (77/65). See [[05-plans/coverage-campaign-extracts]].

**Local E2E** — Docker stamp + `npm run dev`; never a merge gate: `test:e2e` / `test:e2e:visual` / `test:e2e:llm`.

## Where tests live

| Kind             | Location                                                                 |
| ---------------- | ------------------------------------------------------------------------ |
| Unit             | Co-located `*.test.ts` next to source                                    |
| Component        | Co-located `*.test.tsx` / `*.hook.test.ts`                               |
| Mock-integration | `tests/integration/**`                                                   |
| Contract         | `tests/contracts/**`                                                     |
| E2E              | `tests/e2e/specs/*.spec.ts` (local stamp; not pre-push / GitHub Actions) |

## Windows / Vitest notes

- Pin is exact **`5.0.0`**. Windows wrappers stay until glob/dir entry, `setupFiles`, and unbounded forks are re-validated on Windows + Node 24.
- Wrappers fix drive-letter casing (`f:` vs `F:`) and resolve hoisted workspace `vitest`.
- Component/integration use explicit file lists (glob/dir entry historically flaky on Windows).
- Vitest 5 `defaultExclude` is only `node_modules` + `.git`. Custom `exclude` replaces defaults — spread `configDefaults.exclude`, then `**/dist/**`, `tests/e2e/**`, and unit layer splits (`*.test.tsx`, `*.hook.test.ts`).
- Component pool is **`forks`** (Vitest 5 default). `threads` + Node `fetch` can hang ([vitest#3077](https://github.com/vitest-dev/vitest/issues/3077)). If `test:component` never prints tests / never exits, isolate the last added `*.test.tsx` (see [[05-plans/coverage-campaign-extracts]] — ReportsModal worker crash).

## Agent docs

- Skill: `.cursor/skills/testing/SKILL.md`
- Patterns: `.cursor/skills/testing/PATTERNS.md`
- Utility agent: `.cursor/agents/testing/AGENT.md`

## Coverage baseline

See [[05-plans/testing-baseline]] for measured baseline, inventory, and wave status.
