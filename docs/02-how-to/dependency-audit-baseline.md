# Dependency audit baseline

Last updated: 2026-09-13 (monthly P0+P3 + Stryker 10 + openai 7 + axiom 2 / web-vitals 6 + bullmq 6).

## npm audit --omit=dev (production)

- **0 vulnerabilities**
- Runtime: `express@5`, `openai@7`, `@axiomhq/js@2`, `bullmq@6`, Node 24, `multer@2.3`, `csv-parse@7.0.2`, `fast-xml-parser@5.11`, `adm-zip@0.6.1` (override so `epub2` does not keep 0.5)
- **TypeScript:** `typescript@^7` — `npx tsc` and `import('typescript')` both **7.x**. Lint: oxlint + `oxlint-tsgolint` (`options.typeAware`, no `typeCheck`).
- Scripts use `npm audit --omit=dev --no-workspaces` so monorepo parent hoisting does not skew counts

## npm audit (all, dev included)

- **8** remaining (1 low, 2 moderate, 4 high, 1 critical) — **dev tree only**
- Closed vs 2026-08 baseline: prod high CVEs in `multer`, `csv-parse`, `fast-xml-parser`, `qs`, `adm-zip`, `brace-expansion@2`

### Remaining `audit:all` (accepted)

| Package | Severity | Why deferred |
| ------- | -------- | ------------ |
| `@vitest/mocker` / `vitest@4.0.8` | moderate | Pin; [[05-plans/vitest-5-upgrade]] |
| `baseline-browser-mapping` | moderate | Transitive (browserslist / toolchain) |
| `brace-expansion` 4.x–5.x | high | Override is `brace-expansion@2` only |
| `browserslist` | high | Transitive; `npm audit fix` not applied blindly |
| `fast-uri` | high | Transitive (Ajv / Vercel / Stryker chain) |
| `joi` | (audit: critical/high) | Transitive |
| `tar` | high | Transitive |

### Transitive overrides (tech debt until Vercel upstream)

Scoped `overrides` in `package.json` — **not** global `ajv` / `minimatch` / `path-to-regexp` (breaks Express 5 `router`):

| Override target           | Packages                                               | Reason                                                          |
| ------------------------- | ------------------------------------------------------ | --------------------------------------------------------------- |
| `@vercel/node`            | `undici@6.28.1`, `path-to-regexp@6.3.0`                | Deploy runtime; Express keeps `path-to-regexp@8.x` via `router` |
| `@vercel/python-analysis` | `js-yaml@4.3.2`, `minimatch@10.2.5`, `smol-toml@1.8.0` | Vercel build-utils chain                                        |
| `@vercel/static-config`   | `ajv@8.20.0`                                           | Static config validation                                        |
| Global                    | `adm-zip: $adm-zip`                                    | Force `epub2` onto `adm-zip@0.6.1`                              |
| Global                    | `brace-expansion@2: 2.1.4`                             | Prod `filelist` DoS advisory                                    |
| Global                    | `js-yaml@4.3.2`, `qs@6.16.0`, `smol-toml@1.8.0`        | stylelint/cosmiconfig, express/supertest                        |

Dropped 2026-09: `@stryker-mutator/core.ajv` — Stryker 10 already pins `ajv@~8.20.0`.

**Reject:** `npm audit fix --force` (downgrades `@vercel/node`).

**Stryker 10 / Babel 8:** `@babel/core@8` engines `^22.18.0 || >=24.11.0`. Local Node **24.10** + `.npmrc` `engine-strict=true` needs `npm install --no-workspaces --engine-strict=false`. CI `.nvmrc` is `24` (latest 24.x). Prefer 24.11+ for mutation runs.

## Standalone lockfile (CI)

GitHub Actions runs `npm ci` on the **standalone** `arcane-reader` repo. Regenerate lockfile from package directory:

```bash
cd arcane-reader
npm install --no-workspaces
# or lockfile only:
npm install --package-lock-only --no-workspaces
```

Do **not** rely on monorepo root `f:/arcane/package-lock.json` for CI — Vitest/Stryker entries must live in `arcane-reader/package-lock.json`.

## npm outdated (2026-09-13)

- **Applied:** monthly P3 (Vite 8.3, oxlint 1.82, supabase-js 2.116, openai 7.15, `@axiomhq/js` 2.0, `web-vitals` 6.2, `bullmq` 6.3, zod 4.6, …) + P0 security patches
- **Stryker:** `@stryker-mutator/core` + `vitest-runner` **10.0.0**
- **Deferred majors:** [[05-plans/dependency-major-backlog]]

## Node SSOT

| File                            | Value      |
| ------------------------------- | ---------- |
| `.nvmrc`                        | `24`       |
| `package.json` `engines.node`   | `24.x`     |
| `package.json` `packageManager` | `npm@11.x` |
| `@types/node`                   | `^24.13.4` |

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
| Oxlint + single `typescript@7` (drop ESLint + shim)      | Done   |
| Oxlint type-aware (`oxlint-tsgolint`)                    | Done   |
| Circular check via oxlint `import/no-cycle` (not madge)  | Done   |
| Monthly P0+P3 + `adm-zip` 0.6 (2026-09-13)               | Done   |
| Stryker 10                                               | Done   |

### TypeScript 7 (Wave 13–14)

Wave 13 was dual-package (`@typescript/native` tsc 7 + `@typescript/typescript6` for typescript-eslint). Wave 14 replaced ESLint with oxlint and uses a single `typescript@^7` package.

| Package         | Version             | Role                                             |
| --------------- | ------------------- | ------------------------------------------------ |
| `typescript`    | `^7.0.2`            | `tsc` (typecheck, `build:server`) + Compiler API |
| Lint            | `oxlint`            | `.oxlintrc.json`; Prettier stays                 |
| Type-aware lint | `oxlint-tsgolint@7` | `options.typeAware: true`; **not** `typeCheck`   |

Post-install smoke:

```bash
npx tsc --version                    # 7.x
node -e "import('typescript').then(m => console.log(m.version))"  # 7.x
npm run lint:all && npm run build
```

**Pilot notes (2026-08-29):** `tsconfig.json`, `tsconfig.debug-app.json`, and `tsconfig.prompt-lab-app.json` pass `tsc --noEmit` on TS 7. `tsconfig.client.json` is **not** in `npm run typecheck` (pre-existing gaps); add to gate in a separate client-typecheck wave.

## Local smoke (post override)

After dependency changes affecting deploy:

- `GET /`, `/catalog` — SSR meta HTML
- `GET /api/health` — `status: healthy`
- `GET /robots.txt`, `/sitemap.xml`

Vercel preview deploy recommended after `@vercel/node` / overrides changes.

## Major backlog (npm outdated)

Deferred — one major per PR: [[05-plans/dependency-major-backlog]].

P4: `@types/node` 26 — until Node 26 LTS + `.nvmrc` / `engines.node` / Vercel SSOT trio ([[05-plans/types-node-26-upgrade]]).

## Before (2026-06-28 initial)

- **29** all / **6** prod vulnerabilities
- Node 22, Express 4, OpenAI 4
