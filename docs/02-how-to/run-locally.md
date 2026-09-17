---
type: how-to
status: active
domain: meta
stale: false
created: 2026-05-16
updated: 2026-08-30
canonical: .cursor/rules/deployment.mdc
---

# How to run locally

## Prerequisites

- **Node.js 24** (see `.nvmrc`)
- [NVM for Windows](https://github.com/coreybutler/nvm-windows) — `winget install CoreyButler.NVMforWindows`
- **Docker Desktop** (for the local stack: Redis + Supabase)
- OpenAI API key (real translation still uses OpenAI)

## Node version (nvm-windows)

```powershell
# New terminal after installing nvm
nvm install 24
nvm use 24
node -v   # v24.x

cd path\to\arcane-reader
nvm use (Get-Content .nvmrc)   # or: nvm use 24
npm install
```

Restart Cursor/terminal so `PATH` includes `C:\nvm4w\nodejs` and `%LOCALAPPDATA%\nvm`.

## Local stack (recommended)

Runs Redis, Upstash-REST emulator, and Supabase (Postgres + Auth + Storage + Studio) on your machine. No extra cloud project.

```bash
npm install
cp env.example.txt .env
# Put OPENAI_API_KEY and prod dump keys in .env.local (see below).
# Schema (gitignored): dump public schema via MCP into supabase/bootstrap/schema.sql
# (or see supabase/bootstrap/README.md). Required before first stack:up / stack:load.

npm run stack:up          # restores arcane-reader-stamp:latest if that image exists
```

`.env` already has local demo JWTs and Redis. `.env.local` wins for the same key (API/worker via `src/loadEnv.ts`; Vite does the same). Do not put live `SUPABASE_URL` in `.env.local`.

| Port  | Service                               |
| ----- | ------------------------------------- |
| 54321 | Supabase API / Auth / Storage         |
| 54322 | Postgres                              |
| 54323 | Studio                                |
| 54324 | Inbucket (local signup email)         |
| 6379  | Redis (BullMQ)                        |
| 8079  | Serverless Redis HTTP (`local-token`) |

RAM: budget ~2–4 GB for Supabase images plus Redis.

### Prod-like data

Schema and JSON dumps stay **on disk, not in git**. The fast path is a **local stamp image** (`arcane-reader-stamp:latest`) baked from the Postgres volume after load.

**Daily / E2E** (image already built):

```bash
npm run stack:up          # restores stamp image; skip stack:load
npm run dev:full
```

**First time or monthly rebuild:**

1. Schema (not PostgREST): ask the agent to dump public schema via MCP into `supabase/bootstrap/schema.sql`, **or** `npx supabase login` + `db dump --linked`. See `supabase/bootstrap/README.md`.
2. In `.env.local` set `SUPABASE_DUMP_URL` / `SUPABASE_DUMP_SERVICE_ROLE_KEY` to prod HTTPS (not a Postgres URI).
3. `STACK_STAMP=0 npm run stack:up` — bootstrap from schema.sql (ignore any old stamp)
4. `npm run stack:dump` — gitignored JSON → `supabase/dumps/`
5. `npm run stack:load` — reset + seed + data; remaps owners to seed author
6. `npm run stack:stamp` — snapshot PGDATA → `arcane-reader-stamp:latest` (also `:YYYY-MM-DD`)
7. `npm run dev:full`

The stamp image contains prod-like catalog text. Local Docker only — do not push to a public registry. Later private GHCR: `ghcr.io/arcanewords-app/arcane-reader-stamp` (tag/push by hand; no `stack:stamp:push` yet). Rebuild after a Postgres major bump.

Log in as `author@local.test` / `local-dev-password`. Catalog covers still load from **prod** public Storage URLs.

After the stamp is up and `npm run dev` is running, local Playwright: `npm run test:e2e` (see [[run-tests]] and `tests/e2e/README.md`). Between dirty E2E runs: `npm run stack:restore`.

**Never** `npx supabase db push` or MCP `apply_migration` from this machine to prod.

Refresh data after prod changes: `stack:dump` + `stack:load` + `stack:stamp`. Refresh schema after DDL: dump schema again, then load + stamp.

## Cloud Supabase (local app → live prod)

Put prod `SUPABASE_URL` + keys in **`.env.prod.local`** (not `.env.local`). Redis stays local so queues are not shared with the prod worker.

```bash
npm run dev:full:prod
```

Login with a real prod account. Writes go to production. Banner / log line: `Database: PROD …supabase.co`.

## Commands

| Command                              | What runs                                                           |
| ------------------------------------ | ------------------------------------------------------------------- |
| `npm run stack:up`                   | Redis + local Supabase; restores stamp image if present             |
| `npm run stack:down`                 | Stop stack                                                          |
| `npm run stack:status`               | Keys, containers, stamp image                                       |
| `npm run stack:dump`                 | Prod public data → gitignored JSON (`.env.local` `SUPABASE_DUMP_*`) |
| `npm run stack:dump-schema`          | Prints how to dump gitignored `schema.sql` (MCP or CLI)             |
| `npm run stack:load`                 | Local reset + JSON insert + remap owners                            |
| `npm run stack:stamp`                | Bake loaded PGDATA into `arcane-reader-stamp:latest` (monthly)      |
| `npm run stack:restore`              | Re-apply stamp image onto the db volume (fast E2E reset)            |
| `npm run dev`                        | Express API (3000) + Vite client (5173) — **local** Docker Postgres |
| `npm run dev:full`                   | Above + BullMQ worker — **local** DB                                |
| `npm run dev:prod` / `dev:full:prod` | Same processes against **live prod** (`.env.prod.local`)            |
| `npm run worker`                     | Worker only (needs Redis env)                                       |
| `npm run lint` / `npm run typecheck` | oxlint (`src/`) + `tsc --noEmit` (3 tsconfigs)                      |

## Async translation / analysis

Requires Redis in `.env` (local stack) or `.env.local` (Upstash):

- `REDIS_URL` — BullMQ
- `KV_REST_API_URL` + `KV_REST_API_TOKEN` — job state (worker)

Without Redis, use sync endpoints only; batch async returns 503.

## Open app

- Dev UI: Vite proxy or `http://localhost:5173` (see Vite config)
- API: `http://localhost:3000`
- Debug logs (dev only): `http://localhost:3000/debug` or `http://localhost:5173/debug` — see [[debug-translation]]
- Studio: `http://127.0.0.1:54323`

## Editor (Cursor / VS Code)

Workspace recommends the **Oxc** extension (`oxc.oxc-vscode`); it uses local `oxlint` and `.oxlintrc.json`. Disable the ESLint extension for this workspace to avoid duplicate diagnostics. Format-on-save remains Prettier; Oxc only applies lint auto-fixes (`source.fixAll.oxc`).

## Troubleshooting

- Port in use: `npm run kill-port` or `predev:force` script
- 503 on translate: check Redis + worker process (`npm run stack:status`)
- Auth errors: local demo JWTs in `.env`; prod login needs `npm run dev:full:prod`. Cloud `SUPABASE_*` must not live in `.env.local`.
- Dump refused (localhost): set `SUPABASE_DUMP_URL` + `SUPABASE_DUMP_SERVICE_ROLE_KEY` to prod HTTPS (not a Postgres URI)
- `stack:up` missing schema: dump public schema into `supabase/bootstrap/schema.sql` first (see `supabase/bootstrap/README.md`), or restore a stamp image (`npm run stack:stamp` after load)
- `stack:up` ignored stamp: `STACK_STAMP=0` forces schema bootstrap; omit it to restore `arcane-reader-stamp:latest`
- `stack:up` / `stack:reset` killed mid-run: restore parked SQL from `supabase/.temp/parked-migrations/` back into `supabase/migrations/`, then retry
- Stamp Postgres mismatch after CLI bump: rebuild with `STACK_STAMP=0` + `stack:load` + `stack:stamp`
- Registration emails: Inbucket at port 54324, not prod Auth

See also: [[../_canonical/rules/deployment]], [[debug-translation]]
