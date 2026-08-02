# Contract tests (Wave 9 Phase 1)

**Status:** Phase 1 delivered. Zod fixtures inside the monolith; no Pact broker yet.

## Goal

Freeze request/response and shared-type boundaries so a future service split does not silently break the SPA ↔ API contract.

## Phase 1 (monolith) — delivered

| Contract             | Mechanism                                                             | Location                                           |
| -------------------- | --------------------------------------------------------------------- | -------------------------------------------------- |
| API request/response | Zod schemas as SSOT + fixture `safeParse`                             | `tests/contracts/api/*.contract.test.ts`           |
| Shared types         | Round-trip fixtures for `src/shared/**` shapes                        | `tests/contracts/shared/*.contract.test.ts`        |
| Client ↔ server      | Shared JSON fixtures parsed by client domain types and server schemas | `tests/contracts/client-server/*.contract.test.ts` |

Helper: `tests/contracts/helpers/loadFixture.ts`.

### Fixture inventory

| Fixture                                                        | Used by                        |
| -------------------------------------------------------------- | ------------------------------ |
| `status-response.valid.json`                                   | `api/status-shape`             |
| `news-create.valid.json` / `news-create.invalid-category.json` | `api/news-create`              |
| `news-enums.json`                                              | `client-server/news-enums`     |
| `catalog-request-create.valid.json`                            | `api/catalog-request-create`   |
| `catalog-request-statuses.json`                                | `client-server/catalog-status` |
| `publications-list-query.valid.json`                           | `api/publications-list-query`  |
| `chapter-translate-all.json` / `chapter-translate-stages.json` | `api/chapter-translate`        |
| `announcement-dismiss.valid.json`                              | `api/announcement-dismiss`     |
| `project-settings.valid.json`                                  | `api/project-settings`         |
| `publish-body.valid.json`                                      | `api/publish-body`             |
| `translation-request-board-query.json`                         | `api/board-query`              |
| `cache-contract-keys.json`                                     | `shared/cache-contract`        |
| `translation-statuses.json`                                    | `shared/translation-status`    |

## Phase 2 (after service split)

- OpenAPI generated from Zod (or hand-maintained `docs/01-reference/openapi.yaml`)
- Optional Pact / schema diff in CI

## Run

```bash
npm run test:contract
npm run test:contract:coverage   # advisory v8 on src/api/schemas (not a KPI)
npm run test:gaps                # schema + enum-sync inventory gaps → reports/layer-gaps.json
```

`test:contract` is included in pre-push (fast, no network). Gap inventory is manual/advisory — see [[05-plans/testing-strategy#Layer gaps instrument (component + contract)|testing-strategy]].

## Policy

- Prefer fixtures that match production Zod schemas in `src/api/schemas/`
- Do not hit live Supabase or OpenAI
- See [docs/05-plans/testing-strategy.md](../../docs/05-plans/testing-strategy.md)
