---
type: reference
status: active
domain: meta
stale: false
created: 2026-05-16
updated: 2026-05-16
---

# Documentation conventions

## Truth hierarchy

1. **`src/`** — actual behavior
2. **`.cursor/rules/*.mdc`** — SSOT for agents, conventions, policies, route map
3. **`docs/` vault** — human navigation, plans, ADR, onboarding
4. **`docs/archive/`** — legacy markdown; treat as **possibly stale**

If `docs/archive/` or an old plan conflicts with a rule or code, **rules + code win**.

## When to write where

| Need | Where |
|------|--------|
| New coding convention, API policy, route | Extend `.cursor/rules/` first |
| Irreversible architecture decision | `04-decisions/` ADR |
| Future work / RFC | `05-plans/` with `type: plan` |
| Explainer for humans | `03-explanation/` — derive from rules + code, do not copy archive blindly |
| Large reference tables (routes) | `.cursor/rules/routing.mdc` only |

## File naming

- `kebab-case.md`
- No dates in filenames (use frontmatter `created` / `updated`)

## Frontmatter (vault notes)

```yaml
---
type: tutorial | how-to | reference | explanation | adr | plan | runbook
status: draft | active | deprecated | archived
domain: engine | client | api | auth | glossary | export | infra | meta
canonical: .cursor/rules/engine.mdc   # optional
stale: false
created: YYYY-MM-DD
updated: YYYY-MM-DD
---
```

## Language

- New vault notes: **English**
- Legacy archive files may be Russian; update only when touched

## Links

- Wikilinks: `[[architecture]]`, `[[_canonical/rules/routing]]`
- Code: `` `src/server.ts` `` or `@src/server.ts` in rules / AGENTS.md

## Workflow (every task)

```
Code → Rule (if pattern changes) → Vault plan/note (if applicable)
```

1. Implement and verify in `src/`.
2. Update `.cursor/rules/*.mdc` if conventions, routes, env, or logging policy changed.
3. Update `docs/05-plans/` status or `docs/project-status.md` when scope shifts.
4. Do not copy from `docs/archive/` without code verification.

## PR checklist

- Behavior change → code + relevant `.mdc` rule(s)
- New route → `routing.mdc` + `AppRouter.tsx` + `server.ts` (same PR)
- New env var → `env.example.txt` + `deployment.mdc`
- New logging pattern → `logging.mdc` if policy-level
- Plan done → `05-plans/*` set `status: archived`; update [[../project-status]]
- Optional: ADR in `04-decisions/` for irreversible decisions

## AI session context

- Broad task: `@docs/ROADMAP.md` + `@docs/project-status.md` + domain rule (e.g. `@.cursor/rules/engine.mdc`)
- Editing `src/client/**` or `src/engine/**`: nested `AGENTS.md` in that folder loads with Cursor
- Deep dive: `@docs/03-explanation/...` or `@docs/02-how-to/...` as needed
- Vault is **not** auto-loaded; attach explicitly in Cursor chat

## Cursor-local vs committed agent files

| Path | In git | Purpose |
|------|--------|---------|
| `.cursor/rules/`, `agents/`, `skills/` | yes | Agent SSOT |
| `.cursor/plans/` | no (gitignored) | Cursor UI session plans — not product docs |
| `docs/05-plans/` | yes | Product/engineering plans for humans and agents |
