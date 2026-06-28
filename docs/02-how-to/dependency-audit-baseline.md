# Dependency audit baseline

Last updated: 2026-06-28 (post Node 24 + Express 5).

## npm audit --omit=dev (production)

- **0 vulnerabilities**
- Runtime: `express@5`, `openai@6`, Node 24

## npm audit (all, dev included)

- **12 vulnerabilities** (7 high, 5 moderate) after `npm audit fix` (no `--force`)
- Remaining: dev toolchain chains (esbuild/vite transitive, etc.) — triage P1, no force without approval

## Node SSOT

| File                          | Value  |
| ----------------------------- | ------ |
| `.nvmrc`                      | `24`   |
| `package.json` `engines.node` | `24.x` |
| `@types/node`                 | `^24`  |

## Completed migration waves

| Wave                                                     | Status |
| -------------------------------------------------------- | ------ |
| Node 24 + patches                                        | Done   |
| ESLint 9 + `@vercel/node` 5                              | Done   |
| OpenAI SDK 6                                             | Done   |
| Express 5 + multer 2 + `src/api/routes/`                 | Done   |
| Express migration cleanup + smoke checklist              | Done   |
| `dotenv` 17, `csv-parse` 7, `pino` 10 + `pino-pretty` 13 | Done   |
| `zod` 4                                                  | Done   |
| `vite` 8                                                 | Done   |
| `i18next` 26 + `react-i18next` 17                        | Done   |
| `stylelint` 17 + `eslint` 10 + `globals` 17              | Done   |
| SEO routes → `src/api/routes/seo.ts`                     | Done   |
| Skill + dependency-audit agent                           | Done   |

## Express 5 types trial (archived)

Pre-migration trial with `@types/express@5` on unmigrated code: ~266 `tsc` errors from raw `req.params` / `req.query`. Resolved via `validateRoute.ts`, router extraction, `Express.Request` global augmentation. See archived plan `docs/05-plans/express-5-migration.md`.

## Major backlog (npm outdated)

Deferred: `typescript` 6, `@types/node` 26 (with Node 26 LTS), `concurrently` 10, `wait-on` 9 (dev-only).

## Before (2026-06-28 initial)

- **29** all / **6** prod vulnerabilities
- Node 22, Express 4, OpenAI 4
