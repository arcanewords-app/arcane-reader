# Supabase migrations (Arcane Reader)

**Local SQL files:** `supabase/migrations/` (gitignored). **Agent rule:** `@.cursor/rules/supabase.mdc`.  
This README is the committed migration history when `.sql` files are not in git.

Migrations are applied to project `arcane` (`ugcnqejiiybaatcqxmgn`) via Supabase Dashboard or MCP `apply_migration`.

## Manual dashboard step (not SQL)

After security migrations, enable **Leaked password protection** in Supabase Dashboard:

**Authentication → Providers → Email → Password security** → enable protection against compromised passwords (HaveIBeenPwned).

## Migration history

| File                                                       | Purpose                                                                                                                 |
| ---------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `20260621120000_lock_profiles_role.sql`                    | Block self-service role/subscription escalation on `profiles`                                                           |
| `20260621120100_publications_view_security_invoker.sql`    | `publications_list_with_counts` respects caller RLS                                                                     |
| `20260621120200_revoke_anon_write_grants.sql`              | Revoke anon write on `projects` / `publications`                                                                        |
| `20260621120300_security_advisor_hardening.sql`            | Function `search_path`, RPC revoke, storage listing fix                                                                 |
| `20260621120400_revoke_prevent_role_change_rpc.sql`        | Block RPC access to trigger-only `prevent_role_change`                                                                  |
| `20260621120500_fix_rpc_search_path.sql`                   | Schema-qualified table names in RPC functions (`search_path = ''`)                                                      |
| `20260622120000_catalog_translation_requests.sql`          | User catalog translation requests + RLS                                                                                 |
| `20260622130000_chapter_partial_translation_status.sql`    | Add `partial` to `chapters_status_check`; backfill `completed` → `partial` when paragraph coverage incomplete           |
| `20260622140000_paragraph_search_trgm_rpc.sql`             | `pg_trgm` GIN indexes on `paragraphs` text columns; RPC `search_paragraphs_in_project` for project-wide find            |
| `20260622200000_search_rpc_translated_chapter_title.sql`   | Search RPC: return `chapter_translated_title` for display title                                                         |
| `20260627120000_publications_source_url.sql`               | `publications.source_url`; recreate `publications_list_with_counts` view                                                |
| `20260628120000_catalog_translation_request_interests.sql` | Author interests on translation requests + RLS                                                                          |
| `20260628201245_translator_pseudonyms.sql` (remote)        | `owner_user_id`, `status` on `public_entities`; author pseudonym RLS + limit trigger                                    |
| `20260707200000_translator_pseudonym_limit_three.sql`      | Align pseudonym limit trigger to max **3** (via Supabase MCP)                                                           |
| `20260708180000_import_chapters_batch_timeout.sql`         | `import_chapters_batch`: `SET statement_timeout=120s`, `search_path=''`                                                 |
| `20260708190000_heavy_rpc_statement_timeout.sql`           | Heavy RPC registry: `ALTER FUNCTION SET statement_timeout` (write 120s, read 60s); fix `search_path` on 3 write RPC     |
| `20260710220000_fix_renumber_reorder_search_path.sql`      | `renumber_chapters_atomic` / `reorder_chapters`: `public.chapters` + `public.projects` (empty `search_path` regression) |
| `20260718100000_mark_chapters_as_translated_bulk.sql`      | `mark_chapters_as_translated_batch`: set-based bulk UPDATE; stable reason codes                                         |
| `20260718120000_publication_ratings.sql`                   | `publication_ratings` table, RLS, denormalized `rating_*` on `publications`, recreate `publications_list_with_counts`   |

## Heavy RPC policy

Supabase role **`authenticated`** has `statement_timeout = 8s`. Do **not** raise it globally (`ALTER ROLE authenticated`).

Batch or loop RPC that touch many `chapters` / `paragraphs` rows must use a **function-level** override. SSOT for names: `supabase/migrations/20260708190000_heavy_rpc_statement_timeout.sql`.

| Function                            | Tier  | Timeout | Notes                                                       |
| ----------------------------------- | ----- | ------- | ----------------------------------------------------------- |
| `mark_chapters_as_translated_batch` | write | 120s    | Set-based UPDATE paragraphs + chapters; stable reason codes |
| `import_chapters_batch`             | write | 120s    | Insert chapters + split paragraphs                          |
| `reorder_chapters`                  | write | 120s    | Mass UPDATE `chapters.number`                               |
| `renumber_chapters_atomic`          | write | 120s    | Renumber all chapters in project                            |
| `search_paragraphs_in_project`      | read  | 60s     | `pg_trgm` over project paragraphs                           |

**When adding a new heavy RPC:** append the function name to the registry migration (or a follow-up migration with the same `DO` block pattern) and add a row to this table.

**Light RPC (keep default 8s):** `get_translated_chapter_count`, `get_chapter_counts_by_projects`, `get_chapters_summary_batch`, `increment_token_usage_atomic` (when added).

## Accepted remaining advisor WARNs

- `get_chapter_counts_by_projects`, `get_chapters_summary_batch`, `get_translated_chapter_count` remain executable by **authenticated** — required by author workspace via user JWT (`supabaseDatabase.ts` RPC calls).
- **Leaked password protection** — enable manually in Dashboard (see above).
- `prompt_lab_*` tables — dev-only, RLS with no policies (blocks all direct API access).
