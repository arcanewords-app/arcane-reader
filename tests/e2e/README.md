# E2E / system tests (Wave 10+)

**Status:** blocked — no dedicated test environment (isolated Supabase / Redis / BullMQ for CI).

## Prerequisites

- [ ] Isolated Supabase project with seed fixtures and JWT users per role
- [ ] Redis + BullMQ worker instance
- [ ] `.env.test` credentials (never prod/staging)
- [ ] CI job (docker-compose or dedicated test stack)
- [ ] Playwright installed and wired (`playwright.config.ts`)

Until these exist, `npm run test:e2e` exits with a placeholder message.

## Planned smoke flows (~10–15)

| Flow                  | Route sketch                                  |
| --------------------- | --------------------------------------------- |
| Guest catalog browse  | `/` → filter → publication card               |
| Auth login/logout     | modal → session persist                       |
| Author create project | `/projects` → new → settings                  |
| Translate chapter     | chapter → translate → progress                |
| Reader progress       | `/p/*/reading` → next chapter → progress save |
| Admin entity review   | `/admin/entities` (admin role)                |

## Policy

- E2E **never** against prod/staging as a CI merge gate
- Prefer the dedicated test stack; mock-first Playwright is optional for local smoke only
- Strategy SSOT: [docs/05-plans/testing-strategy.md](../../docs/05-plans/testing-strategy.md)

## Live integration sibling

Supabase live domain tests (also blocked): [tests/integration/supabase/README.md](../integration/supabase/README.md)
