---
type: adr
status: accepted
domain: meta
stale: false
created: 2026-05-16
updated: 2026-05-16
---

# ADR-0000: Rules-first documentation SSOT

## Status

Accepted (2026-05-16)

## Context

- ~70 legacy markdown files in `docs/` were written over time and may not match current code.
- Cursor already uses `.cursor/rules/` for agent guidance; some rules incorrectly pointed at `docs/ROUTES.md` and `docs/ICONS_PLAN.md`.
- Team adopted Obsidian for human-readable docs (plans, ADR, navigation).

## Decision

1. **SSOT for conventions and reference policies:** `.cursor/rules/*.mdc`, verified against `src/`.
2. **SSOT for route map:** `.cursor/rules/routing.mdc` (not `docs/ROUTES.md`).
3. **Obsidian vault** at `docs/` for MOC, plans (`05-plans/`), ADR, explanations — always link to canonical rules via `canonical:` frontmatter or `docs/_canonical/rules/` junction.
4. **Legacy flat docs** moved to `docs/archive/` with `stale: true`; never copy into vault without code/rule verification.

## Consequences

- Agents and PRs update rules before (or with) vault notes.
- `docs/ROUTES.md` is a stub for GitHub links only.
- New documentation starts in rules; vault adds narrative and planning, not duplicate API tables.

## See also

- [[_meta/conventions]]
- [[Home]]
