---
name: dependency-maintenance
description: npm audit, outdated deps, CVE response, and phased dependency updates for Arcane Reader. Use when updating packages, triaging npm audit, Node version bumps, or monthly maintenance. Not for RLS/BOLA/secrets — see security skill.
---

# Dependency Maintenance

**Boundary:** This skill covers **npm packages, Node runtime, lockfile, CVE triage**. Application security (RLS, BOLA, secrets) → `@.cursor/skills/security/SKILL.md`.

**Workflow owner:** `@.cursor/agents/dependency-audit.md` (utility agent).

## Triggers

- User asks to update dependencies, run `npm audit`, fix CVEs, bump Node
- Monthly maintenance cadence (recommended)
- After major ecosystem news (Express, OpenAI SDK, ESLint, Vercel runtime)

## Commands (repo root: `arcane-reader`)

```bash
npm run audit:prod      # P0 — production tree only
npm run audit:all       # P1 — includes devDependencies
npm run deps:outdated   # classify patch/minor vs major
npm run lint:all        # lint + typecheck (required gate)
npm run build           # required after dependency changes
```

**Never** run `npm audit fix --force` without explicit user approval (may jump majors).

## Priority matrix (P0–P4)

| P      | Criteria                                                    | SLA                | Action                                            |
| ------ | ----------------------------------------------------------- | ------------------ | ------------------------------------------------- |
| **P0** | Critical/High in **prod** (`audit:prod`)                    | 1–3 days           | Patch/upgrade prod chain; verify engine/API smoke |
| **P1** | High in **dev** with deploy impact (`@vercel/node`, ESLint) | ~1 week            | Dev-toolchain wave; Vercel preview                |
| **P2** | Major framework (Express, OpenAI, Zod)                      | Separate PR / plan | See wave rules + domain agent                     |
| **P3** | Patch/minor, no CVE                                         | Monthly            | Batch in one PR                                   |
| **P4** | Deferred / low urgency                                      | Backlog            | Document only                                     |

## Wave rules

1. **Baseline first** — capture `audit:prod`, `audit:all`, `deps:outdated` (compare to `@docs/02-how-to/dependency-audit-baseline.md`).
2. **One major per PR** — do not combine Express + Zod + Vite in one diff.
3. **Order:** patch/minor → dev security chain → prod runtime majors → UI/build majors.
4. **Gate:** `npm run lint:all && npm run test && npm run build` + domain smoke (see below).
5. **Lockfile** — commit `package-lock.json`; run `npm install` from monorepo root (`f:/arcane`) when workspace hoisting matters. Root [`f:/arcane/.npmrc`](f:/arcane/.npmrc) uses `legacy-peer-deps=true` for `madge` + `eslint-plugin-import` peer gaps; root `eslint@^10` satisfies hoisted import plugin.

## Node.js SSOT (mandatory trio)

When changing Node **major**, update **all three in one PR**:

| File                            | Purpose                   |
| ------------------------------- | ------------------------- |
| `.nvmrc`                        | Local `nvm use`           |
| `package.json` → `engines.node` | Vercel + npm engine check |
| `@types/node` (devDep)          | TypeScript                |

Also sync: `@docs/02-how-to/run-locally.md`, `@.cursor/skills/local-dev/SKILL.md`, `@.cursor/rules/deployment.mdc`, Vercel Dashboard Node version, worker host.

**Blocker:** `.nvmrc` major ≠ `engines.node` major.

## Express (current)

- **Runtime:** `express@5.x`
- **Types:** `@types/express@5` — augment via `declare global { namespace Express { interface Request { … } } }` in `@src/types/express.d.ts`
- **Route boundary:** `@src/api/validateRoute.ts` (`validateParams`, `validateQuery`, `requireRouteParam`)
- **Multer:** `multer@2.x` + `@src/shared/multerCompat.ts`
- **API routers:** `@src/api/routes/` (registered from `server.ts`)
- **Archived plan:** `@docs/05-plans/express-5-migration.md`

## Domain smoke tests (after P0–P2 changes)

| Domain  | Package examples                             | Verify                                   |
| ------- | -------------------------------------------- | ---------------------------------------- |
| Engine  | `openai`                                     | `npm run test`; one translate job        |
| API     | `express`, `multer`                          | Chapter/glossary/avatar upload endpoints |
| Backend | `bullmq`, `ioredis`, `@supabase/supabase-js` | `dev:full` + worker job                  |
| UI dev  | `vite`, `eslint`, `@preact/*`                | `npm run build`, client loads            |
| Deploy  | `@vercel/node`                               | Vercel preview deploy                    |

## P4 backlog (defer — separate PRs)

| Package       | Latest (2026-06) | Notes                                              |
| ------------- | ---------------- | -------------------------------------------------- |
| `@types/node` | 26.x             | Only with Node 26 LTS + SSOT trio (`.nvmrc`, etc.) |

## Mitigations (temporary — document as tech debt)

- `npm overrides` for transitive CVE (e.g. `ws`) when parent package cannot upgrade yet
- Accept risk + note in PR when fix requires `--force` or breaking major
- Monorepo: `legacy-peer-deps` in root `.npmrc` until `madge` publishes TS 6 peer; root `eslint` until `eslint-plugin-import` publishes ESLint 10 peer

## Completed waves (2026-06-28)

| Wave                          | Status | Notes                                                                     |
| ----------------------------- | ------ | ------------------------------------------------------------------------- |
| 1 Node 24 + patches           | Done   | `.nvmrc`, engines, audit scripts                                          |
| 2 ESLint 9 + `@vercel/node` 5 | Done   | flat `eslint.config.js`                                                   |
| 3 OpenAI SDK 6                | Done   | prod audit clean                                                          |
| 4 Express 5 + multer 2        | Done   | types-first; routers in `src/api/routes/`                                 |
| 5 Post-Express hygiene        | Done   | baseline, stylelint v16 fix, smoke checklist, migration artifact cleanup  |
| 6 Low-risk majors             | Done   | `dotenv` 17, `csv-parse` 7, `pino` 10, `pino-pretty` 13                   |
| 7 Zod 4                       | Done   | schemas + `validateRoute.ts`                                              |
| 8 Vite 8                      | Done   | client + debug + prompt-lab builds                                        |
| 9 i18next 26                  | Done   | `react-i18next` 17                                                        |
| 10 Dev lint                   | Done   | `stylelint` 17, `eslint` 10, `globals` 17, `eslint-plugin-unused-imports` |
| SEO router                    | Done   | `src/api/routes/seo.ts`                                                   |
| 11 Dev scripts                | Done   | `wait-on` 9, `concurrently` 10                                            |
| 12 TypeScript 6               | Done   | tsconfig: `types: ["node"]`, removed `baseUrl`; `vite-env.d.ts` for CSS   |
| Skill + agent                 | Done   | this file                                                                 |

**Current target:** `npm run audit:prod` → 0 vulnerabilities.

## References

- Baseline: `@docs/02-how-to/dependency-audit-baseline.md`
- Human runbook: `@docs/02-how-to/dependency-maintenance.md`
- Deploy / Node: `@.cursor/rules/deployment.mdc`
- Security (app): `@.cursor/skills/security/SKILL.md`
