---
name: local-dev
description: Local dev setup, npm scripts, ripgrep, Obsidian vault (docs/). Use for run locally, search repo/vault, env troubleshooting, plan updates.
---

# Local Dev & Obsidian Skill

## When To Use

- First-time or broken local setup (`npm run dev`, worker, Redis)
- Searching the codebase or vault without guessing paths
- Updating `docs/05-plans/`, `project-status.md`, or vault navigation
- Port conflicts, 503 on async jobs, env variable questions

Read `@.cursor/rules/deployment.mdc` for env/deploy policy. Human guide: `@docs/02-how-to/obsidian-vault.md`.

---

## A. Local dev (npm)

| Task                     | Command              |
| ------------------------ | -------------------- |
| Install deps             | `npm install`        |
| API + Vite UI            | `npm run dev`        |
| API + UI + BullMQ worker | `npm run dev:full`   |
| Worker only              | `npm run worker`     |
| Server only              | `npm run dev:server` |
| Client only              | `npm run dev:client` |
| Free port 3000           | `npm run kill-port`  |
| Force restart API        | `npm run dev:force`  |
| Lint + typecheck         | `npm run lint:all`   |
| ESLint                   | `npm run lint`       |
| Typecheck                | `npm run typecheck`  |
| Format                   | `npm run format`     |
| Production build         | `npm run build`      |

**Node:** `.nvmrc` pins **22**. On Windows use [nvm-windows](https://github.com/coreybutler/nvm-windows): `nvm install 22`, `nvm use 22`. Restart the terminal after install so `PATH` picks up `C:\nvm4w\nodejs`.

**First run:**

```bash
# bash
cp env.example.txt .env

# PowerShell
Copy-Item env.example.txt .env
```

Edit `.env`: `OPENAI_API_KEY`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`. For async analyze/translate add `REDIS_URL`, `KV_REST_API_URL`, `KV_REST_API_TOKEN`.

**URLs:** UI `http://localhost:5173`, API `http://localhost:3000`.

---

## B. Ripgrep (code search)

Use `rg` from repo root (`f:\arcane\arcane-reader` or `./`).

```bash
# API route handlers
rg "app\.(get|post|put|patch|delete)\(" src/server.ts

# Client routes
rg "<Route|path=" src/client/AppRouter.tsx

# i18n keys in components
rg "t\(['\"]" src/client --glob "*.tsx"

# Cache invalidation
rg "invalidateProject" src/

# Zod validation in handlers
rg "safeParse" src/server.ts -n

# Engine stage
rg "StageResult|stage-" src/engine/stages

# Env var usage
rg "process\.env\." src --glob "*.ts"

# Find symbol definition
rg "function functionName" src/
```

---

## C. Obsidian vault (`docs/`)

**Vault root = `docs/` folder.** Wikilinks omit `docs/`.

| Task                  | Command                                        |
| --------------------- | ---------------------------------------------- |
| Active plans          | `rg "^status: active" docs/05-plans -g "*.md"` |
| Stale notes           | `rg "stale: true" docs/`                       |
| Search topic in plans | `rg -i "keyword" docs/05-plans`                |
| Search all vault      | `rg -i "keyword" docs --glob "*.md"`           |
| List plan files       | `rg --files docs/05-plans -g "*.md"`           |
| Frontmatter status    | `rg "^status:" docs/05-plans`                  |

**Common wikilinks (from any note in vault):**

- `[[Home]]` — vault index
- `[[ROADMAP]]` — priorities
- `[[project-status]]` — tactical snapshot
- `[[05-plans/engine-refactor]]` — plan note
- `[[_canonical/rules/routing]]` — route map mirror
- `[[_meta/conventions]]` — vault conventions

**Update a plan when done:**

1. Set frontmatter `status: archived` and bump `updated: YYYY-MM-DD`.
2. Update `docs/project-status.md` (remove or note completion).
3. Do not delete plan files unless explicitly requested.

**Open vault in Obsidian:** File → Open folder as vault → select `arcane-reader/docs`.

---

## D. Rules ↔ vault sync

When editing `.cursor/rules/*.mdc`, update the matching file under `docs/_canonical/rules/` if it exists as a tracked copy (e.g. `team-orchestrator.mdc`, `routing.mdc`).

---

## E. Scripts (one-offs)

```bash
# EPUB diagnostics
npx tsx scripts/diagnose-epub.ts <path-to.epub>

# CSV pattern tool
npm run csv-patterns
```

See `scripts/README-csv-patterns.md` for CSV workflow.

---

## F. Troubleshooting quick checks

| Symptom                 | Check                                       |
| ----------------------- | ------------------------------------------- |
| Port in use             | `npm run kill-port`                         |
| 503 on batch translate  | Redis env + `npm run worker` or `dev:full`  |
| Auth fails locally      | Supabase keys in `.env`, JWT in browser     |
| API unreachable from UI | API on 3000, Vite proxy in `vite.config.ts` |

---

## Anti-patterns

- Inventing npm scripts not in `package.json`
- Using `docs/archive/` as SSOT without code check
- Wikilinks with `docs/` prefix inside vault notes
- Committing `.env` or logging secrets
