---
type: tutorial
status: active
domain: meta
stale: false
created: 2026-05-16
updated: 2026-08-30
---

# Quick start

## Dev setup

```bash
npm install
cp env.example.txt .env          # local stack defaults
# .env.local: OPENAI_API_KEY (+ SUPABASE_DUMP_* for stack:dump)
# schema.sql (gitignored): dump public schema via MCP before first stack:up / stack:load
npm run stack:up                 # Docker Redis + local Supabase (restores stamp image if present)
npm run dev:full                 # local Docker Postgres + worker
# Live prod DB: keys in .env.prod.local, then npm run dev:full:prod
```

App: `http://localhost:3000`

## Documentation map

1. [[Home]] — vault index
2. [[_canonical/rules/]] — **SSOT** for agents (Cursor rules)
3. [[_meta/conventions]] — when to use rules vs vault

## Before coding

- Read [[_canonical/rules/core]] and [[_canonical/rules/architecture]]
- API work: [[_canonical/rules/api]], [[_canonical/rules/routing]]
- UI work: [[_canonical/rules/client]], [[_canonical/rules/design-system]]
- Engine: [[translation-pipeline]]

## Commands

```bash
npm run lint
npm run typecheck
npm run dev:full         # API + client + worker against local Docker Postgres
npm run dev:full:prod    # same, live prod DB (`.env.prod.local`)
```

Tests: [[02-how-to/run-tests]] (pre-push + GitHub Actions pyramid; local Playwright after `stack:up` + `dev`).

Legacy deployment guides in `archive/` may be outdated — verify against `env.example.txt` and Vercel config in repo root.
