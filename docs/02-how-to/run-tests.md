# Run tests

Unit tests use **Vitest**. Policy: [[_canonical/rules/testing]]. Strategy (pyramid): [[05-plans/testing-strategy]].

Tests never require prod/staging `.env` credentials. Q3 uses mocks at all external boundaries. Q4 live integration / E2E requires a dedicated test environment (not available yet). See [[05-plans/testing-baseline]].

## Commands

```bash
npm run test                 # fast unit suite (excludes tiktoken slow tests)
npm run test:slow            # slow preview/chunking tests (~100 s)
npm run test:component       # Testing Library + happy-dom (*.test.tsx, *.hook.test.ts)
npm run test:integration     # mock-integration (createApp + supertest)
npm run test:contract        # contract fixtures (Wave 9)
npm run test:e2e             # placeholder until Playwright + test env
npm run test:all             # unit + slow + component + integration + contract
npm run test:watch           # watch mode
npm run test:coverage        # HTML + summary (coverage/ is gitignored)
npm run test:mutation        # Stryker mutation — manual/nightly only (hours)
npx stryker run --mutate src/engine/glossary/glossary-filter.ts   # mutation smoke
npx vitest run src/engine/glossary   # focused directory
```

## APP_SCOPE (coverage + mutation)

`vitest.config.ts` and `stryker.conf.json` share the same scope:

- **include:** `src/**/*.ts` (backend + client SPA)
- **exclude:** `*.test.ts`, `src/debug-app/**`, `src/prompt-lab-app/**`, `src/debug/**`, `src/prompt-lab/**`

Inventory: `node scripts/gen-test-inventory.mjs` (after coverage run).

## Before push

Pre-push hook runs:

```bash
npm run lint:all
npm run test
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

## Agent docs

- Skill: `.cursor/skills/testing/SKILL.md`
- Patterns: `.cursor/skills/testing/PATTERNS.md`
- Utility agent: `.cursor/agents/testing/AGENT.md`

## Coverage baseline

See [[05-plans/testing-baseline]] for measured baseline, inventory, and wave status.
