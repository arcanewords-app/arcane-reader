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

## PR checklist

- Behavior change → code + relevant `.mdc` rule(s)
- Route change → `routing.mdc` + `AppRouter.tsx` + `server.ts`
- Optional plan/ADR update in vault
