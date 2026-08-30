---
type: how-to
status: active
domain: meta
stale: false
created: 2026-05-16
updated: 2026-08-30
---

# How to add a feature (full stack)

Standard path for a new API-backed UI feature. Follow rules: [[../_canonical/rules/api]], [[../_canonical/rules/client]], [[../_canonical/rules/cache]], [[../_canonical/rules/testing]].

## 1. API contract

- Add Zod schema in `src/api/schemas/` (domain file or `common.ts`).
- `safeParse` in handler; **400** with `details` on failure.

## 2. Route

- Implement in `src/server.ts`.
- Auth: `requireAuth`, `requireRole('author')` as needed — see [[../_canonical/rules/auth]].
- Catch: `if (handleServiceError(error, req, res)) return;` first line.

## 3. Cache

- Mutations: invalidate per `@.cursor/rules/cache.mdc` (`invalidateProjectAndRelatedCaches`, etc.).

## 4. Database

- Use `@src/services/supabaseDatabase.ts`; types from `@src/storage/types.ts`.
- snake_case columns.

## 5. Client

- API method in `src/client/api/client.ts`.
- UI in `src/client/components/` or `pages/` using primitives from `components/ui/`.
- Follow `@.cursor/rules/design-system.mdc`.

## 6. i18n

- Keys in `src/client/locales/en.json` and `ru.json`.

## 7. Routes (if new paths)

- Update `@.cursor/rules/routing.mdc`, `src/client/AppRouter.tsx`, `src/server.ts` in **one PR**.

## 8. Tests (choose layer; Playwright is not required)

Pick from [[../_canonical/rules/testing]] — do **not** default to unit-only, and do **not** substitute local E2E for the rows below.

- Pure logic (`engine/` / `shared/` / helpers) → co-located `*.test.ts` (`npm run test`)
- Preact component / hook / page → `*.test.tsx` / `*.hook.test.ts` (`npm run test:component`)
- New/changed Express route → `tests/integration/api/*.test.ts` (`npm run test:integration`)
- Shared enum / high-churn request shape not already covered by Zod unit tests → `tests/contracts/**` (`npm run test:contract`)

Domain agents are **not** required to add Playwright specs with every feature.

## 9. Documentation

- New convention → extend `.cursor/rules/*.mdc`
- Future work → `docs/05-plans/` with `type: plan`, `status: active`

## Checklist

- [ ] Layer-appropriate tests (unit / component / mock-integration / selective contract)
- [ ] `npm run lint:all` and the suites for those layers
- [ ] Cache invalidation on writes
- [ ] No secrets in logs ([[../_canonical/rules/logging]])
- [ ] Shareable UI state synced to URL per [[../_canonical/rules/spa-navigation]]
