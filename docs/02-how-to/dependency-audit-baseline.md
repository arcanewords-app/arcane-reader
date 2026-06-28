# Dependency audit baseline

Last updated: 2026-06-28 (Wave 6 — final dependency backlog).

## npm audit --omit=dev (production)

- **0 vulnerabilities**
- Runtime: `express@5`, `openai@6`, Node 24, `typescript@6` (dev/build only)

## npm audit (all, dev included)

- **12 vulnerabilities** (7 high, 5 moderate) after `npm audit fix` (no `--force`)
- Remaining: dev toolchain chains (esbuild/vite transitive, etc.) — triage P1, no force without approval

## npm outdated (2026-06-28 post Wave 6)

- **Only major left:** `@types/node` 26 — defer until Node 26 LTS + SSOT trio
- All other tracked majors done (`typescript` 6, `concurrently` 10, `wait-on` 9)

## Monorepo install notes

- Run `npm install` from **`f:/arcane`** (workspace root), not only `arcane-reader/`
- [`f:/arcane/.npmrc`](f:/arcane/.npmrc): `legacy-peer-deps=true` — required for `madge@8` (TS 6 peer metadata) and `eslint-plugin-import@2.32` (ESLint 10 peer not published yet)
- [`f:/arcane/package.json`](f:/arcane/package.json): root `eslint@^10` — hoisted `eslint-plugin-import` resolves `require('eslint')` from monorepo root

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
| `wait-on` 9 + `concurrently` 10 (dev scripts)            | Done   |
| `typescript` 6 + tsconfig (no `baseUrl`, `types: node`)  | Done   |
| Skill + dependency-audit agent                           | Done   |

## Express 5 types trial (archived)

Pre-migration trial with `@types/express@5` on unmigrated code: ~266 `tsc` errors from raw `req.params` / `req.query`. Resolved via `validateRoute.ts`, router extraction, `Express.Request` global augmentation. See archived plan `docs/05-plans/express-5-migration.md`.

## Major backlog (npm outdated)

Deferred: `@types/node` 26 only — with Node 26 LTS + `.nvmrc` / `engines.node` / Vercel SSOT trio.

## Before (2026-06-28 initial)

- **29** all / **6** prod vulnerabilities
- Node 22, Express 4, OpenAI 4
