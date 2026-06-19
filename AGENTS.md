# Arcane Reader — Agent Instructions

Navigation map for AI agents. **Policies and architecture live in `.cursor/rules/`** (loaded automatically); do not duplicate them here.

## Start here

| Need                      | Where                                                                                                            |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Which agent owns the task | [`.cursor/rules/team-orchestrator.mdc`](.cursor/rules/team-orchestrator.mdc) (agent-requested when implementing) |
| Code style, PR checklist  | [`.cursor/rules/core.mdc`](.cursor/rules/core.mdc)                                                               |
| Module map, data flow     | [`.cursor/rules/architecture.mdc`](.cursor/rules/architecture.mdc)                                               |
| Route map (SSOT)          | [`.cursor/rules/routing.mdc`](.cursor/rules/routing.mdc)                                                         |
| All domain rules          | [`.cursor/rules/`](.cursor/rules/)                                                                               |
| Local dev, vault, grep    | [`.cursor/skills/local-dev/SKILL.md`](.cursor/skills/local-dev/SKILL.md)                                         |
| News posts, announcements | [`.cursor/skills/news-content/SKILL.md`](.cursor/skills/news-content/SKILL.md) — technical-startup voice         |
| Obsidian vault (MCP)      | [`.cursor/skills/obsidian-mcp/SKILL.md`](.cursor/skills/obsidian-mcp/SKILL.md) — Obsidian must be running        |
| Trello boards (MCP)       | [`.cursor/skills/trello-mcp/SKILL.md`](.cursor/skills/trello-mcp/SKILL.md) — credentials in `~/.cursor/mcp.json` |
| Prod/staging logs (MCP)   | [`.cursor/skills/axiom-mcp/SKILL.md`](.cursor/skills/axiom-mcp/SKILL.md) — OAuth via official Axiom MCP          |

**Workflow:** orchestrator → read active [`.cursor/agents/<domain>/AGENT.md`](.cursor/agents/) + [`.cursor/skills/<domain>/SKILL.md`](.cursor/skills/) → follow domain `.mdc` rules.

**Nested context:** [`src/client/AGENTS.md`](src/client/AGENTS.md), [`src/engine/AGENTS.md`](src/engine/AGENTS.md), [`docs/AGENTS.md`](docs/AGENTS.md) (Obsidian vault).

**Utility subagents** (not domain team): `devtools.md` (Windows VM: search/files/npm — invoke when shell commands fail or repeat), `seo` ([`.cursor/agents/seo/AGENT.md`](.cursor/agents/seo/AGENT.md) — audits, GSC, publication SEO), `news-content` ([`.cursor/agents/news-content/AGENT.md`](.cursor/agents/news-content/AGENT.md) — `/news` posts and banners), `verifier.md`, `debugger.md`, `supabase-docs-setup.md`, `obsidian-mcp-setup.md`, `trello-mcp-setup.md`, `axiom-mcp-setup.md` in [`.cursor/agents/`](.cursor/agents/).

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
