---
type: how-to
status: active
domain: meta
stale: false
created: 2026-05-16
updated: 2026-05-16
canonical: .cursor/rules/deployment.mdc
---

# How to run locally

## Prerequisites

- **Node.js 22** (see `.nvmrc`)
- [NVM for Windows](https://github.com/coreybutler/nvm-windows) — `winget install CoreyButler.NVMforWindows`
- Supabase project (URL + anon + service role keys)
- OpenAI API key

## Node version (nvm-windows)

```powershell
# New terminal after installing nvm
nvm install 22
nvm use 22
node -v   # v22.x

cd path\to\arcane-reader
nvm use (Get-Content .nvmrc)   # or: nvm use 22
npm install
```

Restart Cursor/terminal so `PATH` includes `C:\nvm4w\nodejs` and `%LOCALAPPDATA%\nvm`.

## Setup

```bash
npm install
cp env.example.txt .env
# Edit .env: OPENAI_API_KEY, SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY
```

## Commands

| Command                              | What runs                               |
| ------------------------------------ | --------------------------------------- |
| `npm run dev`                        | Express API (3000) + Vite client (5173) |
| `npm run dev:full`                   | Above + BullMQ worker (`src/worker.ts`) |
| `npm run worker`                     | Worker only (needs Redis env)           |
| `npm run lint` / `npm run typecheck` | Quality checks before PR                |

## Async translation / analysis

Requires in `.env`:

- `REDIS_URL` — BullMQ
- `KV_REST_API_URL` + `KV_REST_API_TOKEN` — job state (worker)

Without Redis, use sync endpoints only; batch async returns 503.

## Open app

- Dev UI: Vite proxy or `http://localhost:5173` (see Vite config)
- API: `http://localhost:3000`
- Debug logs (dev only): `http://localhost:3000/debug` or `http://localhost:5173/debug` — see [[debug-translation]]

## Troubleshooting

- Port in use: `npm run kill-port` or `predev:force` script
- 503 on translate: check Redis + worker process
- Auth errors: verify Supabase keys and JWT in requests

See also: [[../_canonical/rules/deployment]], [[debug-translation]]
