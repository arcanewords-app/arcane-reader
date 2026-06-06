---
type: plan
status: archived
domain: meta
stale: true
created: 2026-06-01
updated: 2026-06-06
trello: https://trello.com/b/bJJpiDqs/arcane-reader
canonical: .cursor/rules/logging.mdc
superseded_by: docs/04-decisions/adr-observability-axiom.md
---

# Observability: Grafana Loki (future)

> **Archived 2026-06-06.** Superseded by [[../04-decisions/adr-observability-axiom]] — production logs ship to Axiom via `@axiomhq/pino`; local `/debug` unchanged.

## Replacement docs

| Topic               | Link                                        |
| ------------------- | ------------------------------------------- |
| ADR (decision)      | [[../04-decisions/adr-observability-axiom]] |
| Setup & ops runbook | [[../02-how-to/observability-axiom]]        |
| Local dev debugging | [[../02-how-to/debug-translation]]          |
| Logging policy      | [[../_canonical/rules/logging]]             |

Trello epic (#55–#64) superseded — close or cancel cards in favor of Axiom ADR.

Historical Loki/Grafana/LogQL content removed to avoid stale env vars (`LOKI_URL`, etc.). For archived detail see git history of this file.
