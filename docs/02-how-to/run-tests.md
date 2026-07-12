# Run tests

Unit tests use **Vitest**. Policy: [[_canonical/rules/testing]].

Tests never require prod/staging `.env` credentials. Q3 uses mocks at all external boundaries. Q4 live integration requires a dedicated test environment (not available yet). See [[05-plans/testing-baseline]].

## Commands

```bash
npm run test              # fast suite (~12 s; excludes tiktoken slow tests)
npm run test:slow         # slow preview/chunking tests (~100 s)
npm run test:all          # fast + slow
npm run test:watch        # watch mode
npm run test:coverage     # HTML + summary (coverage/ is gitignored)
npm run test:mutation     # Stryker mutation — manual/nightly only (hours)
npx stryker run --mutate src/engine/glossary/glossary-filter.ts   # mutation smoke
npx vitest run src/engine/glossary   # focused directory
```

## APP_SCOPE (coverage + mutation)

`vitest.config.ts` and `stryker.conf.json` share the same scope:

- **include:** `src/**/*.ts` (backend + client SPA)
- **exclude:** `*.test.ts`, `src/debug-app/**`, `src/prompt-lab-app/**`

Inventory: `node scripts/gen-test-inventory.mjs` (after coverage run).

## Before push

Pre-push hook runs:

```bash
npm run lint:all
npm run test
```

Emergency bypass: `HUSKY=0 git push` (document why).

## Where tests live

Co-located `*.test.ts` next to source — e.g. `paragraphSync.ts` → `paragraphSync.test.ts`.

## Agent docs

- Skill: `.cursor/skills/testing/SKILL.md`
- Patterns: `.cursor/skills/testing/PATTERNS.md`
- Utility agent: `.cursor/agents/testing/AGENT.md`

## Coverage baseline

See [[05-plans/testing-baseline]] for measured baseline, inventory, and mutation scores.
