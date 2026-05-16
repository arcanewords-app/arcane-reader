---
type: reference
status: active
domain: meta
stale: false
created: 2026-05-16
updated: 2026-05-16
---

# Arcane Reader — Documentation

## Start here

1. **Project status (AI anchor):** [[project-status]]
2. **Agents & conventions (SSOT):** [[_canonical/rules/]] — Cursor rules in `.cursor/rules/`
3. **Conventions:** [[_meta/conventions]]
4. **Archive triage:** [[_meta/archive-triage]]
5. **Onboarding:** [[00-start/quick-start]]

## Canonical rules (`.cursor/rules/`)

| Rule | Topic |
|------|--------|
| [[_canonical/rules/core]] | Code style, structure |
| [[_canonical/rules/architecture]] | System architecture |
| [[_canonical/rules/api]] | Express API, Zod, 503 |
| [[_canonical/rules/routing]] | **Route map (SSOT)** |
| [[_canonical/rules/cache]] | Redis invalidation |
| [[_canonical/rules/auth]] | Roles, JWT |
| [[_canonical/rules/engine]] | Translation pipeline |
| [[_canonical/rules/client]] | Preact UI |
| [[_canonical/rules/design-system]] | Tokens, icons, a11y |
| [[_canonical/rules/deployment]] | Env, Vercel, worker |
| [[_canonical/rules/logging]] | Pino, req.log, levels |

If a note in `archive/` or an old plan disagrees with a rule or `src/`, **code + rules win**.

## Vault sections

| Folder | Purpose |
|--------|---------|
| [[00-start/]] | Tutorials |
| [[01-reference/]] | Short derived summaries (link to rules) |
| [[02-how-to/]] | Task guides |
| [[03-explanation/]] | Concepts (verified against code) |
| [[04-decisions/]] | ADRs |
| [[05-plans/]] | Active RFCs / plans |
| [[06-runbooks/]] | Ops / incidents |
| [[archive/]] | Legacy docs (may be stale) |

## How-to

- [[02-how-to/run-locally]]
- [[02-how-to/add-feature]]
- [[02-how-to/debug-translation]]

## Active work

- Plans: [[05-plans/]] — **Active Plans** base view (6 active)
- Decisions: [[04-decisions/adr-0000-rules-first-documentation-ssot]]
