# Arcane Reader — Agent Instructions

Navigation map for AI agents. **Policies and architecture live in `.cursor/rules/`** (loaded automatically); do not duplicate them here.

## Start here

| Need                      | Where                                                                                                                               |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| Which agent owns the task | [`.cursor/rules/team-orchestrator.mdc`](.cursor/rules/team-orchestrator.mdc) (agent-requested when implementing)                    |
| Code style, PR checklist  | [`.cursor/rules/core.mdc`](.cursor/rules/core.mdc)                                                                                  |
| Module map, data flow     | [`.cursor/rules/architecture.mdc`](.cursor/rules/architecture.mdc)                                                                  |
| Route map (SSOT)          | [`.cursor/rules/routing.mdc`](.cursor/rules/routing.mdc)                                                                            |
| Security policies         | [`.cursor/rules/security.mdc`](.cursor/rules/security.mdc) + [`.cursor/skills/security/SKILL.md`](.cursor/skills/security/SKILL.md) |
| All domain rules          | [`.cursor/rules/`](.cursor/rules/)                                                                                                  |
| Local dev, vault, grep    | [`.cursor/skills/local-dev/SKILL.md`](.cursor/skills/local-dev/SKILL.md)                                                            |
| UI patterns & UX recipes  | [`.cursor/skills/ui/PATTERNS.md`](.cursor/skills/ui/PATTERNS.md) — filters, chips, toolbars                                         |
| News posts, announcements | [`.cursor/skills/news-content/SKILL.md`](.cursor/skills/news-content/SKILL.md) — technical-startup voice                            |
| Obsidian vault (MCP)      | [`.cursor/skills/obsidian-mcp/SKILL.md`](.cursor/skills/obsidian-mcp/SKILL.md) — Obsidian must be running                           |
| Trello boards (MCP)       | [`.cursor/skills/trello-mcp/SKILL.md`](.cursor/skills/trello-mcp/SKILL.md) — credentials in `~/.cursor/mcp.json`                    |
| Prod/staging logs (MCP)   | [`.cursor/skills/axiom-mcp/SKILL.md`](.cursor/skills/axiom-mcp/SKILL.md) — OAuth via official Axiom MCP                             |
| Local dev debug (curl)    | [`.cursor/skills/debug-local/SKILL.md`](.cursor/skills/debug-local/SKILL.md) — `/api/debug/query` on localhost:3000                 |
| npm audit, deps, Node     | [`.cursor/skills/dependency-maintenance/SKILL.md`](.cursor/skills/dependency-maintenance/SKILL.md) — CVE triage, phased updates     |

**Workflow:** orchestrator → read active [`.cursor/agents/<domain>/AGENT.md`](.cursor/agents/) + [`.cursor/skills/<domain>/SKILL.md`](.cursor/skills/) → follow domain `.mdc` rules.

**Nested context:** [`src/client/AGENTS.md`](src/client/AGENTS.md), [`src/engine/AGENTS.md`](src/engine/AGENTS.md), [`docs/AGENTS.md`](docs/AGENTS.md) (Obsidian vault).

**Utility subagents** (not domain team): `devtools.md` (Windows VM: search/files/npm — invoke when shell commands fail or repeat), `dependency-audit.md` (npm audit, outdated, CVE response — see dependency-maintenance skill), `seo` ([`.cursor/agents/seo/AGENT.md`](.cursor/agents/seo/AGENT.md) — audits, GSC, publication SEO), `news-content` ([`.cursor/agents/news-content/AGENT.md`](.cursor/agents/news-content/AGENT.md) — `/news` posts and banners), `verifier.md`, `debugger.md`, `supabase-docs-setup.md`, `obsidian-mcp-setup.md`, `trello-mcp-setup.md`, `axiom-mcp-setup.md` in [`.cursor/agents/`](.cursor/agents/).

## Session anchors

For large or multi-step work, attach at session start:

```
@docs/ROADMAP.md
@docs/project-status.md
```

Human vault (plans, ADR): [`docs/Home.md`](docs/Home.md) — not agent SSOT. Prefer **code + `.cursor/rules/`** over `docs/archive/`.

## Truth hierarchy

1. `src/` — behavior
2. `.cursor/rules/` — conventions and policies
3. `docs/` vault — plans and how-to
4. `docs/archive/` — legacy; may be stale

## Commands

Quick reference — full cheat sheet: [`.cursor/skills/local-dev/SKILL.md`](.cursor/skills/local-dev/SKILL.md).

```bash
npm run dev          # API + client
npm run dev:full     # + BullMQ worker
npm run lint:all     # lint + typecheck
```

## Supabase Docs

Before Supabase work, use live docs via SSH (see [`.cursor/skills/supabase-docs/SKILL.md`](.cursor/skills/supabase-docs/SKILL.md)):

```bash
ssh supabase.sh grep -rl 'auth' /supabase/docs/
ssh supabase.sh cat /supabase/docs/guides/auth/passwords.md
```

## Cursor Cloud specific instructions

### Node.js

The VM default Node is v22 under `/exec-daemon/node`, but this repo requires **Node 24** (`.nvmrc`, `package.json` `engines`). Before any npm command, prepend Node 24 to `PATH`:

```bash
export PATH="$HOME/.nvm/versions/node/v24.18.0/bin:$PATH"
node --version   # expect v24.x
```

If Node 24 is not installed yet: `source ~/.nvm/nvm.sh && nvm install 24`.

### Dependencies

There is **no committed `package-lock.json`**. Use:

```bash
npm install --legacy-peer-deps
```

(`eslint@10` vs `eslint-plugin-import` peer conflict otherwise blocks install.)

After install, if Vite fails with missing esbuild binary, run `npm rebuild esbuild` or re-run install with scripts allowed.

### Environment (`.env`)

Copy `env.example.txt` → `.env` and fill **required** keys (see `.cursor/rules/deployment.mdc`):

- `OPENAI_API_KEY`
- `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`

Optional for async batch jobs: `REDIS_URL`, `KV_REST_API_URL`, `KV_REST_API_TOKEN`.

**After changing `.env`, restart dev servers** — `tsx watch` does not reload env vars on file change.

There is no local Supabase stack in this repo (migrations live in hosted Supabase project `arcane`, applied via Dashboard/MCP). Docker Compose under `src/docker-compose.yml` is optional for local Redis only.

### Dev servers

| Command            | What runs                                                              |
| ------------------ | ---------------------------------------------------------------------- |
| `npm run dev`      | API (:3000) + Vite client (:5173) + debug (:5174) + prompt-lab (:5175) |
| `npm run dev:full` | Same + BullMQ worker (needed for `?async=1` translate/analyze)         |

Start in **tmux** (long-running). Vite clients wait on `tcp:127.0.0.1:3000` before binding.

Verify before UI debugging:

```bash
curl -s http://localhost:3000/api/health   # expect status healthy when Supabase reachable
curl -s http://localhost:3000/api/status   # AI configured, config valid
```

Primary UI entry: **http://localhost:5173** (proxies `/api` → 3000).

### Lint / test / build

Standard commands from `package.json` — no extra Cloud setup:

```bash
npm run lint:all          # eslint + stylelint + typecheck
npm run build             # client + debug + prompt-lab + server tsc
node --import tsx --test $(git ls-files '*.test.ts')   # unit tests (188+)
```

### Gotchas

- Port 3000 busy → `npm run kill-port`
- `/api/health` `down` + `fetch failed` → bad/missing Supabase URL or network; fix `.env` and restart
- Public catalog/news work without login; author workspace (`/projects/*`) needs auth
- Async batch endpoints return **503** without Redis + worker (`npm run dev:full`)
