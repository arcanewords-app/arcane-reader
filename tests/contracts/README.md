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

| Fixture                                                                         | Used by                                 |
| ------------------------------------------------------------------------------- | --------------------------------------- |
| `status-response.valid.json`                                                    | `api/status-shape`                      |
| `news-create.valid.json` / `news-create.invalid-category.json`                  | `api/news-create`                       |
| `news-enums.json`                                                               | `client-server/news-enums`              |
| `catalog-request-create.valid.json`                                             | `api/catalog-request-create`            |
| `catalog-request-statuses.json`                                                 | `client-server/catalog-status`          |
| `chapter-statuses.json`                                                         | `client-server/chapter-status`          |
| `glossary-enums.json`                                                           | `client-server/glossary-enums`          |
| `catalog-interest-statuses.json`                                                | `client-server/catalog-interest-status` |
| `public-entity-kinds.json`                                                      | `client-server/public-entity-kinds`     |
| `supported-languages.json`                                                      | `client-server/supported-languages`     |
| `publications-list-query.valid.json`                                            | `api/publications-list-query`           |
| `chapter-translate-all.json` / `chapter-translate-stages.json`                  | `api/chapter-translate`                 |
| `announcement-dismiss.valid.json`                                               | `api/announcement-dismiss`              |
| `project-settings.valid.json`                                                   | `api/project-settings`                  |
| `publish-body.valid.json`                                                       | `api/publish-body`                      |
| `translation-request-board-query.json`                                          | `api/board-query`                       |
| `glossary-create.valid.json` / `glossary-create.invalid-type.json`              | `api/glossary-create`                   |
| `project-languages.valid.json` / `project-languages.invalid-pair.json`          | `api/project-languages`                 |
| `translate-batch.valid.json`                                                    | `api/translate-batch`                   |
| `interest-update.valid.json`                                                    | `api/interest-update`                   |
| `read-progress.complete.valid.json` / `read-progress.set.valid.json`            | `api/read-progress`                     |
| `publication-rating.valid.json` / `publication-rating.invalid.json`             | `api/publication-rating`                |
| `paragraph-update.valid.json`                                                   | `api/paragraph-update`                  |
| `project-create.valid.json` / `project-create.invalid-pair.json`                | `api/project-create`                    |
| `glossary-update.valid.json` / `glossary-update.invalid-type.json`              | `api/glossary-update`                   |
| `project-ai-replace.valid.json`                                                 | `api/project-ai-replace`                |
| `language-pair.valid.json` / `language-pair.invalid-source.json`                | `api/language-pair`                     |
| `chapter-ids.valid.json` / `chapter-ids.invalid-empty.json`                     | `api/chapter-ids`                       |
| `chapter-title.valid.json` / `chapter-title.invalid-empty.json`                 | `api/chapter-title`                     |
| `chapter-number.valid.json` / `chapter-number.invalid.json`                     | `api/chapter-number`                    |
| `chapters-order.valid.json` / `chapters-order.invalid-empty.json`               | `api/chapters-order`                    |
| `paragraph-bulk-update.valid.json` / `paragraph-bulk-update.invalid-empty.json` | `api/paragraph-bulk-update`             |
| `export-body.valid.json` / `export-body.invalid-format.json`                    | `api/export-body`                       |
| `chapter-critic.valid.json`                                                     | `api/chapter-critic`                    |
| `glossary-merge.valid.json` / `glossary-merge.invalid-one.json`                 | `api/glossary-merge`                    |
| `glossary-bulk-delete.valid.json` / `glossary-bulk-delete.invalid-empty.json`   | `api/glossary-bulk-delete`              |
| `glossary-import-entry.valid.json` / `glossary-import-entry.invalid-type.json`  | `api/glossary-import-entry`             |
| `glossary-export-query.valid.json`                                              | `api/glossary-export-query`             |
| `project-clone.valid.json`                                                      | `api/project-clone`                     |
| `project-rename.valid.json` / `project-rename.invalid-empty.json`               | `api/project-rename`                    |
| `transfer-chapters.valid.json` / `transfer-chapters.invalid-empty.json`         | `api/transfer-chapters`                 |
| `chapter-bulk-ids.valid.json` / `chapter-bulk-ids.invalid-empty.json`           | `api/chapter-bulk-ids`                  |
| `project-search-query.valid.json` / `project-search-query.invalid-field.json`   | `api/project-search-query`              |
| `report-body.valid.json` / `report-body.invalid-empty.json`                     | `api/report-body`                       |
| `cache-contract-keys.json`                                                      | `shared/cache-contract`                 |
| `translation-statuses.json`                                                     | `shared/translation-status`             |

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
