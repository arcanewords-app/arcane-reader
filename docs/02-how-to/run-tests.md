# Run tests

Unit tests use **Vitest**. Policy: [[_canonical/rules/testing]].

Tests never require prod/staging `.env` credentials. Integration-style, component, and E2E tests use mocks at external boundaries (LLM, Supabase, Redis, HTTP). See [[05-plans/testing-baseline#Strategy mock-first (no test env)]].

## Commands

```bash
npm run test              # fast suite (~12 s; excludes tiktoken slow tests)
npm run test:slow         # slow preview/chunking tests (~100 s)
npm run test:all          # fast + slow
npm run test:watch        # watch mode
npm run test:coverage     # HTML + summary (coverage/ is gitignored)
npx vitest run src/engine/glossary   # focused directory
```

## Coverage scope

`vitest.config.ts` uses `coverage.include: ['src/**/*.ts']` and excludes `src/client/**`, test files, and lab apps. UI pages are out of scope until Q4+ component tests.

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

See [[05-plans/testing-baseline]] for measured baseline (updated after first `test:coverage` run).
