# ADR: Watermark reading progress

## Status

Accepted (2026-07-18)

## Context

`user_publication_progress` stored two independent signals:

- `read_chapter_ids[]` — per-chapter checklist (not necessarily contiguous)
- `last_read_chapter_id` + `last_read_paragraph_index` — bookmark / paragraph resume

Users confused Continue (bookmark) with read checkmarks. Paragraph position added complexity (visibilitychange, beforeunload, dual restore paths) with little benefit for serialized fiction.

## Decision

Single **watermark** per `(user_id, publication_id)`:

- `last_read_chapter_number` (int, default 0): chapters with `number <= N` are read
- `last_read_at` for history sort

### Advance rules (variant 2 — Royal Road style)

| Action                              | Effect                        |
| ----------------------------------- | ----------------------------- |
| **Next** on chapter K               | `N = max(N, K)`               |
| Open chapter K where `K > N + 1`    | Confirm: set progress to K?   |
| Open K where `K <= N` or `K == N+1` | No automatic watermark change |
| TOC «Mark up to here»               | `N = K` (explicit set)        |
| Last chapter scroll ≥85%            | `N = max(N, K)`               |
| Reset                               | `N = 0`                       |

**Continue** opens first chapter with `number > N` and `hasTranslation`, else publication page.

### Jump-ahead confirm

When opening chapter `K > N + 1`, user is asked whether to mark chapters up to K as read.

- **Yes** → `N = K` (set)
- **No** → read chapter K without changing N (modal closes; user stays on the chapter)

### Intentional removals (vs old dual model)

- **Per-chapter mark** (`read_chapter_ids` checklist) → replaced by watermark set via TOC / chapter list «mark up to here»
- **Implicit mark on chapter leave** (exit / TOC navigation after 85% scroll on middle chapters) → removed; only **Next** and last-chapter 85% advance N
- **Bookmark on last opened chapter** → bookmark icon shows watermark chapter N («read up to here»), not reading position

### Deferred (documented, not removed from DB yet)

- `PATCH /api/publications/:id/reading-position` — paragraph bookmark
- Auth scroll restore from API (`resolveReadingParagraphIndex` server branch)
- Guest `?paragraph=` deep links remain for share URLs only

Deprecated columns: `read_chapter_ids`, `last_read_chapter_id`, `last_read_paragraph_index`.

## Consequences

- Simpler API: `GET/POST/PATCH/DELETE .../read-progress`
- Ratings eligibility: `lastReadChapterNumber >= 1`
- Profile/catalog show `readCount` = chapters with `number <= N`
- Re-numbering chapters by author may desync watermark; user can set/reset manually

## References

- Plan: `docs/05-plans/reading-progress-watermark.md`
- Domain: `src/shared/reading-progress.ts`
- Service: `src/services/supabase/domains/readerProgress.ts`
