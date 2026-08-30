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
# (or see supabase/bootstrap/README.md). Required before stack:up.

npm run stack:up
```

`.env` already has local demo JWTs and Redis. `.env.local` wins for the same key (API/worker via `src/loadEnv.ts`; Vite does the same).

| Port  | Service                               |
| ----- | ------------------------------------- |
| 54321 | Supabase API / Auth / Storage         |
| 54322 | Postgres                              |
| 54323 | Studio                                |
| 54324 | Inbucket (local signup email)         |
| 6379  | Redis (BullMQ)                        |
| 8079  | Serverless Redis HTTP (`local-token`) |

RAM: budget ~2–4 GB for Supabase images plus Redis.

### Prod-like data (once per machine)

Schema and data dumps stay **on disk, not in git**. Each developer dumps them locally.

1. Schema (not PostgREST): ask the agent to dump public schema via MCP into `supabase/bootstrap/schema.sql`, **or** `npx supabase login` + `db dump --linked`. See `supabase/bootstrap/README.md`.
2. In `.env.local` set `SUPABASE_DUMP_URL` / `SUPABASE_DUMP_SERVICE_ROLE_KEY` to prod HTTPS (not a Postgres URI). `npm run stack:up`.
3. `npm run stack:dump` — gitignored JSON → `supabase/dumps/`
4. `npm run stack:load` — reset + seed + data; remaps owners to seed author
5. `npm run dev:full`

```bash
npm run stack:dump
npm run stack:load
```

Log in as `author@local.test` / `local-dev-password`. Catalog covers still load from **prod** public Storage URLs.

**Never** `npx supabase db push` or MCP `apply_migration` from this machine to prod.

Refresh data after prod changes: `stack:dump` + `stack:load`. Refresh schema after DDL: dump schema again, then `stack:load`.

## Cloud Supabase (old path)

You can still put prod/staging `SUPABASE_URL` + keys in `.env.local` (overrides `.env`) and skip `stack:up`. Async jobs then need Upstash `REDIS_URL` / `KV_REST_*` in `.env.local` as well.

## Commands

| Command                              | What runs                                                           |
| ------------------------------------ | ------------------------------------------------------------------- |
| `npm run stack:up`                   | Redis + local Supabase (needs `supabase/bootstrap/schema.sql`)      |
| `npm run stack:down`                 | Stop stack                                                          |
| `npm run stack:status`               | Keys and container status                                           |
| `npm run stack:dump`                 | Prod public data → gitignored JSON (`.env.local` `SUPABASE_DUMP_*`) |
| `npm run stack:dump-schema`          | Prints how to dump gitignored `schema.sql` (MCP or CLI)             |
| `npm run stack:load`                 | Local reset + JSON insert + remap owners                            |
| `npm run dev`                        | Express API (3000) + Vite client (5173)                             |
| `npm run dev:full`                   | Above + BullMQ worker (`src/worker.ts`)                             |
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
- Auth errors: local demo JWTs in `.env`, not cloud `SUPABASE_*` in `.env.local`
- Dump refused (localhost): set `SUPABASE_DUMP_URL` + `SUPABASE_DUMP_SERVICE_ROLE_KEY` to prod HTTPS (not a Postgres URI)
- `stack:up` missing schema: dump public schema into `supabase/bootstrap/schema.sql` first (see `supabase/bootstrap/README.md`)
- `stack:up` / `stack:reset` killed mid-run: restore parked SQL from `supabase/.temp/parked-migrations/` back into `supabase/migrations/`, then retry
- Registration emails: Inbucket at port 54324, not prod Auth

See also: [[../_canonical/rules/deployment]], [[debug-translation]]
