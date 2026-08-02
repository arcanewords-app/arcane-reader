# Run tests

Unit tests use **Vitest 4.0.8** (exact pin). Policy: [[_canonical/rules/testing]]. Strategy (pyramid): [[05-plans/testing-strategy]].

Tests never require prod/staging `.env` credentials. Q3 uses mocks at all external boundaries. Q4 live integration / E2E requires a dedicated test environment (not available yet). See [[05-plans/testing-baseline]].

## Commands

```bash
npm run test                 # fast unit suite (scripts/test-unit.mjs; excludes tiktoken slow tests)
npm run test:slow            # slow preview/chunking tests (~100 s)
npm run test:component       # Testing Library + happy-dom (*.test.tsx, *.hook.test.ts)
npm run test:integration     # mock-integration (createApp + supertest; scripts/test-integration.mjs)
npm run test:contract        # contract fixtures (Wave 9)
npm run test:e2e             # placeholder until Playwright + test env
npm run test:all             # unit + slow + component + integration + contract
npm run test:watch           # watch mode
npm run test:coverage        # HTML + summary; floors lines 64 / branches 54 (coverage/ gitignored)
npm run test:mutation        # Stryker mutation — manual/nightly only (hours; break: null)
npx stryker run --mutate src/engine/glossary/glossary-filter.ts   # mutation smoke
npm run test -- src/engine/glossary   # focused directory (prefer npm run test over raw npx on Windows)
```

## APP_SCOPE (coverage + mutation)

`vitest.config.ts` and `stryker.conf.json` share the same scope:

- **include:** `src/**/*.ts` (backend + client SPA)
- **exclude:** `*.test.ts` / `*.test.tsx` / `*.hook.test.ts`, `src/debug-app/**`, `src/prompt-lab-app/**`, `src/debug/**`, `src/prompt-lab/**`

Inventory: `node scripts/gen-test-inventory.mjs` (after coverage run).

## Thresholds

| Mechanism              | Policy                                                                                                                                   |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Vitest coverage floors | `coverage.thresholds` in `vitest.config.ts`: lines **64**, branches **54**. Enforced by `npm run test:coverage` only — **not** pre-push. |
| Stryker                | `high: 80`, `low: 60`, `break: null` — advisory bands; never fails the build                                                             |

If coverage drops below floors, fix tests or lower floors **deliberately** in the same PR.

## Before push

Pre-push hook runs:

```bash
npm run lint:all
npm run test
npm run test:component
npm run test:integration
npm run test:contract
```

Emergency bypass: `HUSKY=0 git push` (document why).

## Where tests live

| Kind             | Location                                   |
| ---------------- | ------------------------------------------ |
| Unit             | Co-located `*.test.ts` next to source      |
| Component        | Co-located `*.test.tsx` / `*.hook.test.ts` |
| Mock-integration | `tests/integration/**`                     |
| Contract         | `tests/contracts/**`                       |
| E2E              | `tests/e2e/**` (blocked)                   |

## Windows / Vitest notes

- Pin stays at **4.0.8** until 4.1.x is re-validated on Windows + Node 24.
- Wrappers fix drive-letter casing (`f:` vs `F:`) and resolve hoisted workspace `vitest`.
- Component/integration use explicit file lists (glob/dir entry flaky).

## Agent docs

- Skill: `.cursor/skills/testing/SKILL.md`
- Patterns: `.cursor/skills/testing/PATTERNS.md`
- Utility agent: `.cursor/agents/testing/AGENT.md`

## Coverage baseline

See [[05-plans/testing-baseline]] for measured baseline, inventory, and wave status.
