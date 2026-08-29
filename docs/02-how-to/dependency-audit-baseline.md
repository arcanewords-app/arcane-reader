# Dependency audit baseline

Last updated: 2026-08-29 (TypeScript 7 side-by-side via `@typescript/typescript6` shim).

## npm audit --omit=dev (production)

- **0 vulnerabilities**
- Runtime: `express@5`, `openai@6`, Node 24
- **TypeScript:** `tsc` → **7.0** (`@typescript/native`); `typescript` npm package → **6.0 shim** for `typescript-eslint` (see Wave 13)
- Scripts use `npm audit --omit=dev --no-workspaces` so monorepo parent hoisting does not skew counts

## npm audit (all, dev included)

- **0 vulnerabilities** (standalone `arcane-reader` with `--no-workspaces`)
- Previously **12** (6 high, 6 moderate) in `@vercel/node` / Stryker transitive chains (2026-06-28 baseline)

### Transitive overrides (tech debt until Vercel upstream)

Scoped `overrides` in `package.json` — **not** global `ajv` / `minimatch` / `path-to-regexp` (breaks ESLint 10 and Express 5 `router`):

| Override target           | Packages                                               | Reason                                                          |
| ------------------------- | ------------------------------------------------------ | --------------------------------------------------------------- |
| `@vercel/node`            | `undici@6.27.0`, `path-to-regexp@6.3.0`                | Deploy runtime; Express keeps `path-to-regexp@8.x` via `router` |
| `@vercel/python-analysis` | `js-yaml@4.2.0`, `minimatch@10.2.5`, `smol-toml@1.7.0` | Vercel build-utils chain                                        |
| `@vercel/static-config`   | `ajv@8.20.0`                                           | Static config validation                                        |
| `@stryker-mutator/core`   | `ajv@8.20.0`                                           | Mutation testing only                                           |
| Global                    | `js-yaml@4.2.0`, `qs@6.15.3`, `smol-toml@1.7.0`        | stylelint/cosmiconfig, express/stryker                          |

**Reject:** `npm audit fix --force` (downgrades `@vercel/node` to v4).

## Standalone lockfile (CI)

GitHub Actions runs `npm ci` on the **standalone** `arcane-reader` repo. Regenerate lockfile from package directory:

```bash
cd arcane-reader
npm install --no-workspaces
# or lockfile only:
npm install --package-lock-only --no-workspaces
```

Do **not** rely on monorepo root `f:/arcane/package-lock.json` for CI — Vitest/Stryker entries must live in `arcane-reader/package-lock.json`.

## npm outdated (2026-07-12)

- **Patch applied:** `@vercel/node` `5.8.23`
- **Deferred:** `@types/node` 26 — until Node 26 LTS + SSOT trio

## Node SSOT

| File                            | Value      |
| ------------------------------- | ---------- |
| `.nvmrc`                        | `24`       |
| `package.json` `engines.node`   | `24.x`     |
| `package.json` `packageManager` | `npm@11.x` |
| `@types/node`                   | `^24`      |

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
| Vitest + Stryker + CI lockfile sync                      | Done   |
| Dev audit overrides (`@vercel/node` 5.8.23)              | Done   |
| TypeScript 7 side-by-side (`@typescript/native` + shim)  | Done   |

### TypeScript 7 (Wave 13)

Dual-package setup per [Microsoft TS 7 announcement](https://devblogs.microsoft.com/typescript/announcing-typescript-7-0/):

| Package              | Alias / version                      | Role                                     |
| -------------------- | ------------------------------------ | ---------------------------------------- |
| `@typescript/native` | `npm:typescript@^7.0.2`              | `tsc` (typecheck, `build:server`)        |
| `typescript`         | `npm:@typescript/typescript6@^6.0.2` | Compiler API 6.0 for `typescript-eslint` |

Post-install smoke:

```bash
npx tsc --version                    # 7.x
node -e "import('typescript').then(m => console.log(m.version))"  # 6.x
npm run lint:all && npm run build
```

**Pilot notes (2026-08-29):** `tsconfig.json`, `tsconfig.debug-app.json`, and `tsconfig.prompt-lab-app.json` pass `tsc --noEmit` on TS 7. `tsconfig.client.json` is **not** in `npm run typecheck` (pre-existing gaps on TS 6 and TS 7); add to gate in a separate client-typecheck wave.

**Upgrade to single `typescript@7`:** when TypeScript **7.1** ships programmatic API and `typescript-eslint` widens peer range — remove shim + `@typescript/native` alias.

## Local smoke (post override)

After dependency changes affecting deploy:

- `GET /`, `/catalog` — SSR meta HTML
- `GET /api/health` — `status: healthy`
- `GET /robots.txt`, `/sitemap.xml`

Vercel preview deploy recommended after `@vercel/node` / overrides changes.

## Major backlog (npm outdated)

Deferred:

- `@types/node` 26 — until Node 26 LTS + `.nvmrc` / `engines.node` / Vercel SSOT trio
- **TypeScript 7.1** — single-package upgrade when `typescript-eslint` peer includes TS 7 (remove `@typescript/native` + `@typescript/typescript6` shim)

## Before (2026-06-28 initial)

- **29** all / **6** prod vulnerabilities
- Node 22, Express 4, OpenAI 4
