# Arcane Reader — Agent Instructions

## Team (specialized agents)

A **4-agent team** routes work by domain. The orchestrator rule is always active; each agent has a profile and a skill.

| Agent | Profile | Skill | Primary paths |
|-------|---------|-------|---------------|
| **UI** | [`.cursor/agents/ui/AGENT.md`](.cursor/agents/ui/AGENT.md) | [`.cursor/skills/ui/SKILL.md`](.cursor/skills/ui/SKILL.md) | `src/client/**` |
| **API** | [`.cursor/agents/api/AGENT.md`](.cursor/agents/api/AGENT.md) | [`.cursor/skills/api/SKILL.md`](.cursor/skills/api/SKILL.md) | `src/server.ts`, `src/middleware/**`, `src/api/**` |
| **Backend** | [`.cursor/agents/backend/AGENT.md`](.cursor/agents/backend/AGENT.md) | [`.cursor/skills/backend/SKILL.md`](.cursor/skills/backend/SKILL.md) | `src/services/**`, `src/storage/**`, `src/worker.ts`, `src/shared/**` |
| **Engine** | [`.cursor/agents/engine/AGENT.md`](.cursor/agents/engine/AGENT.md) | [`.cursor/skills/engine/SKILL.md`](.cursor/skills/engine/SKILL.md) | `src/engine/**` |

**Orchestrator:** [`.cursor/rules/team-orchestrator.mdc`](.cursor/rules/team-orchestrator.mdc) (`alwaysApply: true`) — picks primary/secondary agent from paths and task type; does not duplicate agent content.

**Workflow:** orchestrator → read `AGENT.md` + `SKILL.md` for active agent(s) → follow linked `.cursor/rules/*.mdc`.

**Other agents** in [`.cursor/agents/`](.cursor/agents/) (e.g. `debugger.md`, `verifier.md`) are utility subagents, not part of the domain team.

## Rules layering

| Layer | Rules | How loaded |
|-------|-------|------------|
| **Global** | `team-orchestrator`, `core`, `architecture` | `alwaysApply: true` — every session |
| **Domain** | `api`, `cache`, `client`, `engine`, … | File **globs** when editing matching paths; plus explicit list in each `AGENT.md` |
| **Skills** | `.cursor/skills/<agent>/SKILL.md` | Read when acting as that agent; patterns only, not policy SSOT |

| Agent | Global + typical domain rules |
|-------|------------------------------|
| **UI** | + `client`, `design-system`; `routing` when routes change |
| **API** | + `api`, `auth`, `cache`, `logging`, `routing` |
| **Backend** | + `cache`, `deployment`; `api` when route contracts matter |
| **Engine** | + `engine` |

Domain rules are **not** globally always-on (e.g. `api.mdc` and `cache.mdc` use globs so UI/Engine sessions stay lean).

## Documentation (SSOT)

**Canonical source:** [`.cursor/rules/`](.cursor/rules/) — always prefer rules + code over `docs/archive/` legacy files.

| Rule | Topic | alwaysApply |
|------|--------|-------------|
| `team-orchestrator.mdc` | Team routing (UI / API / Backend / Engine) | yes |
| `core.mdc` | Code style, structure | yes |
| `architecture.mdc` | System architecture | yes |
| `api.mdc` | Express API, Zod, 503 | globs |
| `cache.mdc` | Redis invalidation | globs |
| `auth.mdc` | Roles, JWT | globs |
| `engine.mdc` | Translation pipeline | globs |
| `client.mdc` | Preact UI | globs |
| `design-system.mdc` | Tokens, icons, a11y | globs |
| `deployment.mdc` | Env, Vercel, worker | globs |
| `logging.mdc` | Pino, req.log, levels | globs |
| `routing.mdc` | Route map (SSOT) | globs |

**Session anchors:** [`docs/ROADMAP.md`](docs/ROADMAP.md) (priorities and phases), [`docs/project-status.md`](docs/project-status.md) (current snapshot).

**Human vault (plans, ADR):** [`docs/Home.md`](docs/Home.md) — Obsidian; not agent SSOT.

When changing routes: update `routing.mdc`, `src/client/AppRouter.tsx`, and `src/server.ts` in one task.

## Architecture

- **client/** — Preact UI, Vite, i18next. Pages, components, hooks, contexts.
- **engine/** — Translation pipeline: Analyze → Translate → Edit. Glossary, prompts, stages.
- **services/** — Import (epub, fb2, csv, txt), export (epub, fb2), auth, storage.
- **storage/** — DB layer. Supabase for prod, LowDB fallback.
- **middleware/** — Express: auth, requestContext, serviceHealth.

## Conventions

- TypeScript strict. Preact (not React). Functional components.
- snake_case for DB columns. See `@storage/database.ts`.
- 2 spaces, LF, UTF-8 — `.editorconfig`.
- Lint: `npm run lint`, typecheck: `npm run typecheck`, format: `npm run format`.

## Project specifics

- **Text Blocks**: `{{block:type-id}}text{{/block:type-id}}`. Types in `@src/engine/constants/text-block-presets.ts`.
- **Glossary**: characters, locations, terms. Declension via Petrovich.
- **Pipeline**: 3 stages. Prompts in `src/engine/prompts/system/`.

Details: `@.cursor/rules/engine.mdc`, `@.cursor/rules/architecture.mdc`, `@README.md`.

## Supabase Docs

Before working on a Supabase feature, check the docs via `ssh supabase.sh <command>`.

```bash
# Search for a topic
ssh supabase.sh grep -rl 'auth' /supabase/docs/

# Read a specific guide
ssh supabase.sh cat /supabase/docs/guides/auth/passwords.md

# Find all guides in a section
ssh supabase.sh find /supabase/docs/guides/database -name '*.md'

# Search with context
ssh supabase.sh grep -r 'RLS' /supabase/docs/guides/auth --include='*.md' -l
```

All docs live under `/supabase/docs/` as markdown files. You can use any standard Unix tools (grep, find, cat, etc.) to search and read them.
