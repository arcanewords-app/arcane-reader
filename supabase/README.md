# Supabase migrations (Arcane Reader)

Migrations in this folder are applied to project `arcane` (`ugcnqejiiybaatcqxmgn`) via Supabase Dashboard or MCP `apply_migration`.

## Manual dashboard step (not SQL)

After security migrations, enable **Leaked password protection** in Supabase Dashboard:

**Authentication → Providers → Email → Password security** → enable protection against compromised passwords (HaveIBeenPwned).

## Migration history

| File                                                       | Purpose                                                                                                       |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `20260621120000_lock_profiles_role.sql`                    | Block self-service role/subscription escalation on `profiles`                                                 |
| `20260621120100_publications_view_security_invoker.sql`    | `publications_list_with_counts` respects caller RLS                                                           |
| `20260621120200_revoke_anon_write_grants.sql`              | Revoke anon write on `projects` / `publications`                                                              |
| `20260621120300_security_advisor_hardening.sql`            | Function `search_path`, RPC revoke, storage listing fix                                                       |
| `20260621120400_revoke_prevent_role_change_rpc.sql`        | Block RPC access to trigger-only `prevent_role_change`                                                        |
| `20260621120500_fix_rpc_search_path.sql`                   | Schema-qualified table names in RPC functions (`search_path = ''`)                                            |
| `20260622120000_catalog_translation_requests.sql`          | User catalog translation requests + RLS                                                                       |
| `20260622130000_chapter_partial_translation_status.sql`    | Add `partial` to `chapters_status_check`; backfill `completed` → `partial` when paragraph coverage incomplete |
| `20260622140000_paragraph_search_trgm_rpc.sql`             | `pg_trgm` GIN indexes on `paragraphs` text columns; RPC `search_paragraphs_in_project` for project-wide find  |
| `20260622200000_search_rpc_translated_chapter_title.sql`   | Search RPC: return `chapter_translated_title` for display title                                               |
| `20260627120000_publications_source_url.sql`               | `publications.source_url`; recreate `publications_list_with_counts` view                                      |
| `20260628120000_catalog_translation_request_interests.sql` | Author interests on translation requests + RLS                                                                |

## Accepted remaining advisor WARNs

- `get_chapter_counts_by_projects`, `get_chapters_summary_batch`, `get_translated_chapter_count` remain executable by **authenticated** — required by author workspace via user JWT (`supabaseDatabase.ts` RPC calls).
- **Leaked password protection** — enable manually in Dashboard (see above).
- `prompt_lab_*` tables — dev-only, RLS with no policies (blocks all direct API access).
