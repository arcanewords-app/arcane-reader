---
name: supabase-docs
description: Search and read Supabase documentation using a bash shell. Use when working on a Supabase feature or troubleshooting a problem.
---

# Supabase Docs

Search and read Supabase documentation over SSH. Use before guessing RLS, auth, or migration behavior.

## How to use

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

All docs live under `/supabase/docs/` as markdown files.

## Arcane Reader–specific lookups

| Topic                | Example command                                                                        |
| -------------------- | -------------------------------------------------------------------------------------- |
| JWT / session        | `ssh supabase.sh grep -rl 'JWT' /supabase/docs/guides/auth/`                           |
| Row Level Security   | `ssh supabase.sh grep -rl 'row level security' /supabase/docs/guides/database/`        |
| Storage uploads      | `ssh supabase.sh find /supabase/docs/guides/storage -name '*.md'`                      |
| Postgres policies    | `ssh supabase.sh cat /supabase/docs/guides/database/postgres/row-level-security.md`    |
| Service role vs anon | `ssh supabase.sh grep -r 'service_role' /supabase/docs/guides/api --include='*.md' -l` |

**In this repo:** DB access is via `@src/services/supabaseDatabase.ts`; types in `@src/storage/types.ts`. Migrations under `docs/supabase-migrations/` and `docs/migrations/`. Auth middleware: `@src/middleware/auth.ts`. Profile `role` in `profiles` table — see `@.cursor/rules/auth.mdc`.

## Typical workflows

**RLS or permission error on a table**

```bash
ssh supabase.sh grep -r 'policy' /supabase/docs/guides/database/postgres/row-level-security.md
ssh supabase.sh grep -rl 'profiles' /supabase/docs/guides/auth/
```

**Auth / Bearer token issues**

```bash
ssh supabase.sh cat /supabase/docs/guides/auth/sessions.md
ssh supabase.sh grep -r 'Authorization' /supabase/docs/guides/auth --include='*.md' -l
```

**New migration or schema change**

```bash
ssh supabase.sh find /supabase/docs/guides/database -name '*migration*'
```

After reading docs, align changes with `@.cursor/skills/backend/SKILL.md` and invalidate caches per `@.cursor/rules/cache.mdc` when mutating data.
