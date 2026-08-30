# Local schema bootstrap

`schema.sql` is a **schema-only** dump of prod `public` (no row data). It is **gitignored** — each developer dumps it locally.

`stack:load` / `stack:reset` split it into gitignored `supabase/migrations/<timestamp>_bootstrap_*.sql` (tables, constraints, functions, RLS, …) so a syntax error names the **section**, not statement 209 of a 1100-line dump. Each section has its own migration version (CLI uses the 14-digit prefix as the primary key).

Service-role keys **cannot** dump DDL (PostgREST is tables/RPC only).

## Generate / refresh (MCP)

Ask the agent (Supabase MCP `execute_sql` / `list_tables`):

> Dump public schema via MCP into `supabase/bootstrap/schema.sql` (tables, views, functions, RLS, indexes, grants). No row data. Do not `apply_migration` or `db push` to prod.

Do **not** commit `schema.sql`.

## Fallback (CLI login)

```bash
npx supabase login
npx supabase link --project-ref ugcnqejiiybaatcqxmgn
npx supabase db dump --linked -s public -f supabase/bootstrap/schema.sql
```

## First-run local test

```bash
# schema.sql — MCP or CLI dump above (gitignored); required before stack:up
npm run stack:up      # Redis + local Supabase (demo JWTs already in .env)
npm run stack:dump    # .env.local SUPABASE_DUMP_* → supabase/dumps/*.json
npm run stack:load    # reset + seed + data; remaps owners to author@local.test
npm run dev:full
```

Put prod HTTPS keys in `.env.local` as `SUPABASE_DUMP_URL` and `SUPABASE_DUMP_SERVICE_ROLE_KEY`.

Login: `author@local.test` / `local-dev-password`.

After prod DDL: dump schema again, then `stack:load`. After prod data: `stack:dump` + `stack:load`.

**Never** `supabase db push` / `apply_migration` from this dump to prod.
