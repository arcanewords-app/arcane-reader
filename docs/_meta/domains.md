---
type: reference
status: active
domain: meta
stale: false
created: 2026-05-16
updated: 2026-05-16
---

# Domain tags

Use in vault frontmatter `domain:` and plan filtering.

| Domain     | Scope                              | Canonical rule                               |
| ---------- | ---------------------------------- | -------------------------------------------- |
| `meta`     | Documentation, tooling             | [[_meta/conventions]]                        |
| `client`   | Preact UI, i18n                    | [[_canonical/rules/client]]                  |
| `api`      | Express, Zod, REST                 | [[_canonical/rules/api]]                     |
| `auth`     | Roles, JWT, gates                  | [[_canonical/rules/auth]]                    |
| `engine`   | Pipeline, prompts, glossary engine | [[_canonical/rules/engine]]                  |
| `glossary` | Glossary UX and data               | engine + client rules                        |
| `export`   | EPUB/FB2, publications             | [[_canonical/rules/routing]] (export routes) |
| `infra`    | Deploy, Redis, Supabase            | [[_canonical/rules/cache]], architecture     |
