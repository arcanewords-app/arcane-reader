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

- Node.js 20+
- Supabase project (URL + anon + service role keys)
- OpenAI API key

## Setup

```bash
npm install
cp env.example.txt .env
# Edit .env: OPENAI_API_KEY, SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY
```

## Commands

| Command | What runs |
|---------|-----------|
| `npm run dev` | Express API (3000) + Vite client (5173) |
| `npm run dev:full` | Above + BullMQ worker (`src/worker.ts`) |
| `npm run worker` | Worker only (needs Redis env) |
| `npm run lint` / `npm run typecheck` | Quality checks before PR |

## Async translation / analysis

Requires in `.env`:

- `REDIS_URL` — BullMQ
- `KV_REST_API_URL` + `KV_REST_API_TOKEN` — job state (worker)

Without Redis, use sync endpoints only; batch async returns 503.

## Open app

- Dev UI: Vite proxy or `http://localhost:5173` (see Vite config)
- API: `http://localhost:3000`

## Troubleshooting

- Port in use: `npm run kill-port` or `predev:force` script
- 503 on translate: check Redis + worker process
- Auth errors: verify Supabase keys and JWT in requests

See also: [[../_canonical/rules/deployment]], [[debug-translation]]
