---
name: local-dev
description: Local dev on Windows VM — npm, ripgrep, tool choice for search/files, Obsidian vault. Use for run locally, search repo/vault, env troubleshooting, or when shell commands fail.
---

# Local Dev & Obsidian Skill

**Environment:** Windows VM, **PowerShell** shell, repo root `f:\arcane\arcane-reader`.

## When To Use

- First-time or broken local setup (`npm run dev`, worker, Redis)
- Searching the codebase or vault without guessing paths
- Updating `docs/05-plans/`, `project-status.md`, or vault navigation
- Port conflicts, 503 on async jobs, env variable questions

Read `@.cursor/rules/deployment.mdc` for env/deploy policy. Human guide: `@docs/02-how-to/obsidian-vault.md`.

---

## G. Tool choice (read before searching or reading files)

Use this order. **Do not switch to a different tool family after one failure** (e.g. `grep` after `rg`, or `cat` after Read).

| Goal                                | 1st choice                            | 2nd choice                      | Avoid on Windows          |
| ----------------------------------- | ------------------------------------- | ------------------------------- | ------------------------- |
| Search in `src/`                    | `rg "pattern" src/`                   | Cursor Grep / SemanticSearch    | `grep -r`, `find / -name` |
| Search in `docs/`, Obsidian running | MCP `search_simple` / `search_query`  | `rg -i "kw" docs --glob "*.md"` | MCP path `docs/foo.md`    |
| Trello boards (MCP connected)       | Trello MCP `list_boards`, `get_lists` | —                               | —                         |
| Search in `docs/`, no MCP           | `rg -i "kw" docs --glob "*.md"`       | Read known path                 | —                         |
| Read file at known path             | Cursor **Read** tool                  | `Get-Content path`              | `cat`, `type`             |
| Find file by name/pattern           | Cursor **Glob**                       | `rg --files -g "*.tsx" src/`    | `find . -name`            |
| List npm scripts                    | Read `package.json` or §A table       | —                               | invent `npm run …`        |
| Edit vault note (Obsidian up)       | MCP `vault_patch` / `vault_read`      | —                               | rewrite entire note       |
| Edit code                           | domain agent + StrReplace/Write       | —                               | DevTools for feature code |

**Path rules**

- Shell / `rg`: repo-relative — `src/server.ts`, `docs/05-plans/foo.md`
- MCP Obsidian: vault-relative — `05-plans/foo.md` (no `docs/` prefix)
- `@` in chat: workspace path — `@src/server.ts`, `@.cursor/skills/local-dev/SKILL.md`

---

## H. Windows VM (PowerShell)

Default shell is **PowerShell**, not bash. Prefer `rg` and npm; use PS cmdlets only when IDE tools are unavailable.

```powershell
# Repo root (run once)
Set-Location f:\arcane\arcane-reader

# Env file
Copy-Item env.example.txt .env

# rg — use forward slashes; double-quote regex
rg "safeParse" src/server.ts
rg -i "keyword" docs --glob "*.md"
rg --files src/client -g "*.tsx"

# Port / process (if kill-port script insufficient)
npm run kill-port
```

| Instead of (bash)     | Use (Windows)                       |
| --------------------- | ----------------------------------- |
| `cp a b`              | `Copy-Item a b`                     |
| `rm file`             | `Remove-Item file`                  |
| `cat file`            | Read tool, or `Get-Content file`    |
| `export VAR=1`        | `$env:VAR = "1"`                    |
| `grep -r pat .`       | `rg pat`                            |
| `find . -name '*.ts'` | Glob tool or `rg --files -g '*.ts'` |

**If `rg` is missing:** `where.exe rg` — install [ripgrep](https://github.com/BurntSushi/ripgrep/releases) or use Cursor **Grep** tool; do not fall back to `Select-String` across the whole tree.

**WSL:** Only use bash/`grep` if the user explicitly works in a WSL terminal; Cursor Agent shell here is PowerShell.

---

## A. Local dev (npm)

| Task                     | Command                          |
| ------------------------ | -------------------------------- |
| Install deps (monorepo)  | `cd f:\arcane && npm install`    |
| Install deps (reader)    | `npm install` in `arcane-reader` |
| API + Vite UI            | `npm run dev`                    |
| API + UI + BullMQ worker | `npm run dev:full`               |
| Worker only              | `npm run worker`                 |
| Server only              | `npm run dev:server`             |
| Client only              | `npm run dev:client`             |
| Free port 3000           | `npm run kill-port`              |
| Force restart API        | `npm run dev:force`              |
| Lint + typecheck         | `npm run lint:all`               |
| ESLint                   | `npm run lint`                   |
| Typecheck                | `npm run typecheck`              |
| Format                   | `npm run format`                 |
| Production build         | `npm run build`                  |

**Node:** `.nvmrc` pins **24**. On Windows use [nvm-windows](https://github.com/coreybutler/nvm-windows): `nvm install 24`, `nvm use 24`. Restart the terminal after install so `PATH` picks up `C:\nvm4w\nodejs`. Keep `.nvmrc`, `package.json` `engines.node`, and `@types/node` in sync (see `@.cursor/skills/dependency-maintenance/SKILL.md`).

**First run:**

```bash
# bash
cp env.example.txt .env

# PowerShell
Copy-Item env.example.txt .env
```

Edit `.env`: `OPENAI_API_KEY`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`. For async analyze/translate add `REDIS_URL`, `KV_REST_API_URL`, `KV_REST_API_TOKEN`.

**Web scraper** lives in the separate [arcane-scraper](https://github.com/arcane-scraper) repo (`npm run dev` there). Not part of arcane-reader.

**Startup order:** `dev` / `dev:full` start API first; Vite/debug wait on `tcp:127.0.0.1:3000` (`wait-on`) before binding 5173/5174. First API boot via `tsx` can take ~10–30s — look for `[arcane] Starting HTTP server on port 3000…` in the `[0]` process.

**URLs:** UI `http://localhost:5173`, API `http://localhost:3000`. Verify API: `http://localhost:3000/api/health` before debugging UI proxy errors.

---

## B. Ripgrep (code search)

Use `rg` from repo root after `Set-Location f:\arcane\arcane-reader` (see §H). On Windows, quote patterns with double quotes.

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

### MCP (preferred when Obsidian is running)

With **Local REST API** enabled and Cursor MCP `obsidian` connected, use MCP tools instead of only `rg` for read/search/patch. See `@.cursor/skills/obsidian-mcp/SKILL.md`. Setup: copy `@.cursor/mcp.json.example` to `~/.cursor/mcp.json` and set your API key; see `@.cursor/agents/obsidian-mcp-setup.md`.

### Ripgrep fallback

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

| Symptom                 | Check                                                                                |
| ----------------------- | ------------------------------------------------------------------------------------ |
| Port in use             | `npm run kill-port`                                                                  |
| 503 on batch translate  | Redis env + `npm run worker` or `dev:full`                                           |
| Auth fails locally      | Supabase keys in `.env`, JWT in browser                                              |
| API unreachable from UI | `npm run kill-port`, then `dev:server` alone; wait for port 3000                     |
| Vite proxy ECONNREFUSED | API not ready yet or crashed — check `[0]` logs, not only `[1]`                      |
| Worker exits in dev     | Missing `KV_REST_*` — worker skips in dev (warn only); set Redis REST for job cancel |

---

## Anti-patterns

- Inventing npm scripts not in `package.json`
- Using `docs/archive/` as SSOT without code check
- Wikilinks with `docs/` prefix inside vault notes
- Committing `.env` or logging secrets
- `grep`, `find`, `cat`, `cp` in PowerShell when §G lists a better tool
- Retrying the same search with bash vs PS vs MCP without fixing the root cause
- MCP paths like `docs/05-plans/x.md` (wrong — use `05-plans/x.md`)
- Reading entire `routing.mdc` when only one route is needed — `rg "path" .cursor/rules/routing.mdc`
