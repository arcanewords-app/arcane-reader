---
name: security
description: Security patterns for Arcane Reader — RLS, grants, SECURITY DEFINER, BOLA/BFLA, role escalation, secrets. Use for security review, Supabase migrations, auth/access control changes, or when the user mentions security hardening, OWASP, or privilege escalation.
---

# Security Skill

Policies SSOT: `@.cursor/rules/security.mdc`. Auth roles: `@.cursor/rules/auth.mdc`.

## When To Use

- Editing `supabase/migrations/**`, RLS policies, RPC functions, views, grants
- Changing `src/middleware/auth.ts`, role gates, or admin routes
- Adding/changing `src/server.ts` handlers that read or write user-owned data
- New privileged columns (`role`, `subscription`, billing fields)
- Security audit or post-incident review
- After Supabase Security Advisor findings

## Threat Model (Real Incident)

Any authenticated user could `PATCH /rest/v1/profiles` with `{ "role": "admin" }` via PostgREST:

- RLS allowed `UPDATE` on own row but **`WITH CHECK` was missing**
- `GRANT UPDATE (role)` on `profiles` to `anon` / `authenticated`
- Express cached profile role in Redis — stale admin after fix

**Fixes (see `supabase/migrations/2026062112*`):** `REVOKE` on privileged columns, RLS `WITH CHECK`, trigger `prevent_role_change`, `REVOKE EXECUTE` on trigger/RPC helpers, `invalidateProfileCache()` on role/avatar writes.

## Supabase / Postgres Checklist

### RLS

- [ ] Every user-writable table has **both** `USING` and `WITH CHECK` on `UPDATE`/`INSERT`
- [ ] Privileged columns (`role`, `subscription`) are **not** client-writable — server/service role or trigger only
- [ ] Test as `anon` and `authenticated` (not only as `postgres`)

### Views

- [ ] Views over RLS tables use `security_invoker = on` so caller RLS applies
- [ ] If view calls `SECURITY DEFINER` functions, caller needs `EXECUTE` **or** server uses service-role fallback (see `listPublicationsPublic` in `supabaseDatabase.ts`)

### SECURITY DEFINER functions

- [ ] Always `SET search_path = ''`
- [ ] Always schema-qualified names (`public.chapters`, not `chapters`)
- [ ] Recreating a function does **not** reset grants — verify `REVOKE`/`GRANT` after `CREATE OR REPLACE`

```sql
CREATE OR REPLACE FUNCTION public.get_translated_chapter_count(p_project_id uuid)
RETURNS integer
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT count(*)::integer FROM public.chapters
  WHERE project_id = p_project_id
    AND status IN ('completed', 'draft');
$$;
```

### Grants (least privilege)

- [ ] `REVOKE EXECUTE ON FUNCTION ... FROM anon, PUBLIC` for server-only RPC helpers
- [ ] `REVOKE INSERT/UPDATE` on privileged columns from `anon`, `authenticated`
- [ ] Trigger-only functions (`prevent_role_change`, `handle_new_user`) — not callable via PostgREST RPC
- [ ] Document accepted WARNs in `supabase/README.md` when `authenticated` must keep RPC access

### Storage

- [ ] Avoid broad `SELECT` listing policies on buckets — public URLs work without directory listing

## Express API Checklist

### BOLA (Broken Object Level Authorization) — OWASP API1:2023

Authentication is not authorization. For every endpoint with a user-supplied object id (`projectId`, `chapterId`, `publicationId`):

- [ ] Ownership enforced in **DB query or RLS**, not only by comparing JWT user id in app code
- [ ] Prefer `.eq('user_id', userId)` (or equivalent) in the query so unauthorized objects return empty/404
- [ ] Test: authenticate as User A, request User B's resource → expect 403 or 404, never 200 with data

```typescript
// Secure: ownership in query
const { data } = await client
  .from('projects')
  .select('id')
  .eq('id', projectId)
  .eq('user_id', userId)
  .single();
```

### BFLA (Broken Function Level Authorization) — OWASP API5:2023

- [ ] `requireRole('author' | 'admin' | …)` on privileged routes — see `@src/middleware/auth.ts`
- [ ] Admin safeguards: cannot demote self, cannot remove last admin (see admin user routes)

### Input and mass assignment

- [ ] Zod `safeParse` on body/query — no raw `req.body` spread into DB
- [ ] Schemas exclude privileged fields (`role`, `subscription`) unless admin-only route with extra checks

### Errors and availability

- [ ] `handleServiceError` first in catch — Supabase/Redis outages → **503**, not 500
- [ ] Client-facing error messages must not expose stack traces, SQL, or internal paths
- [ ] Do not fail open on auth — missing/invalid token → 401

## Secrets and Config

- [ ] `SUPABASE_SERVICE_ROLE_KEY` only via `createServiceRoleClient()` on server — never in `src/client/**`
- [ ] Anon key + user JWT for RLS-scoped client paths; service role only when RLS bypass is intentional
- [ ] No tokens, API keys, or passwords in logs — see `@.cursor/rules/logging.mdc`
- [ ] New secrets → `env.example.txt` + `@.cursor/rules/deployment.mdc`

## Cache and Auth

- [ ] After role or avatar change, call `invalidateProfileCache(userId)` — see `@.cursor/rules/cache.mdc`
- [ ] Short TTL on auth profile cache (60s) limits stale-role window

## OWASP Mapping (Arcane)

| Risk                                               | Arcane control                                                            |
| -------------------------------------------------- | ------------------------------------------------------------------------- |
| **A01:2025** Broken Access Control / **API1** BOLA | RLS + ownership in queries; `requireRole`; admin safeguards               |
| **A02:2025** Security Misconfiguration             | Grants, `search_path`, `security_invoker`, REVOKE on RPC                  |
| **A05:2025** Injection                             | Zod validation; parameterized Supabase client (no raw SQL in app)         |
| **A06:2025** Insecure Design                       | Privileged columns server-only; defense in depth (RLS + trigger + REVOKE) |
| **A07:2025** Authentication Failures               | Supabase Auth JWT; leaked-password protection (Dashboard manual step)     |
| **A08:2025** Integrity Failures                    | Migrations in repo; no client-side trust for role/subscription            |
| **A09:2025** Logging Failures                      | Structured logs without secrets; Axiom for prod incidents                 |
| **A10:2025** Mishandling Exceptions                | `handleServiceError` → 503; no sensitive data in error responses          |
| **API3** Broken Object Property Level              | Zod schemas — explicit allowlists, no mass assignment                     |
| **API5** BFLA                                      | `requireRole`, admin gates, `AuthorGate` / `AdminGate` on client          |

## Anti-patterns

| Anti-pattern                                         | What went wrong                                                                            |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| RLS `USING` without `WITH CHECK`                     | User updates own row to escalate `role`                                                    |
| `SET search_path = ''` without `public.` qualifiers  | `relation "chapters" does not exist` → 500 on `/api/projects`, `/api/publications`         |
| `security_invoker` view + `REVOKE EXECUTE` from anon | Anon cannot call function in view → permission denied; use service-role fallback on server |
| `GRANT UPDATE` on `profiles.role` to `authenticated` | Direct PostgREST privilege escalation                                                      |
| Service role in client-facing code                   | Bypasses all RLS                                                                           |
| Caching role without invalidation                    | User keeps admin after demotion until TTL expires                                          |
| 500 for Supabase outage                              | Leaks failure mode; use 503 via `handleServiceError`                                       |
| Logging `Authorization` header or JWT                | Credential exposure in logs                                                                |

## Pre-merge Security Checklist

- [ ] RLS policies have `WITH CHECK` where users can write
- [ ] No new client-writable privileged columns without REVOKE + server-only path
- [ ] New `SECURITY DEFINER` functions: `search_path = ''` + qualified names
- [ ] New RPC: explicit `GRANT`/`REVOKE` documented; not exposed to `anon` unless required
- [ ] New API routes: Zod + ownership or `requireRole`
- [ ] Cache invalidation if auth profile fields change
- [ ] `npm run lint:all` passes
- [ ] Run Supabase Security Advisor after migration (MCP or Dashboard)

## Migration Workflow

See `@.cursor/rules/supabase.mdc` for location and naming rules.

1. Write SQL in `supabase/migrations/YYYYMMDDHHMMSS_description.sql`
2. Apply via Supabase MCP `apply_migration` or Dashboard
3. Smoke-test affected RPC/views as `authenticated` and `anon` (`SET ROLE` or PostgREST)
4. Update `supabase/README.md` migration table
5. Verify API endpoints that depend on changed functions/views

## References

- Policies: `@.cursor/rules/security.mdc`
- Auth roles: `@.cursor/rules/auth.mdc`
- Migration history: `@supabase/README.md`
- Supabase docs search: `@.cursor/skills/supabase-docs/SKILL.md`
- [OWASP Top 10:2025](https://owasp.org/Top10/2025/)
- [OWASP API Security Top 10:2023](https://owasp.org/API-Security/editions/2023/en/0x11-t10/)
