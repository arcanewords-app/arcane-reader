# Supabase live integration tests (Q4 — blocked)

**Status:** paused until dedicated test environment exists.

## Prerequisite

Isolated Supabase stack with:

- Seed fixtures (projects, chapters, glossary)
- Test JWT users per role
- Redis + worker optional for job persistence tests

See [docs/05-plans/testing-baseline.md](../../../docs/05-plans/testing-baseline.md) — Q4 live integration policy.

## Planned suite (when unblocked)

| File                           | Scope                                           |
| ------------------------------ | ----------------------------------------------- |
| `projects.integration.test.ts` | `createProject` → `addChapter` → `getChapter`   |
| `search.integration.test.ts`   | `search_paragraphs_in_project` RPC              |
| `catalog.integration.test.ts`  | `createProjectFromCatalogRequest` state machine |

## Run (future)

```bash
# Not wired in CI until test env is provisioned
npx vitest run tests/integration/supabase --config vitest.integration.config.ts
```

Domain modules under `src/services/supabase/domains/` are structured for mock unit tests in Q3 and live injection in Q4.
