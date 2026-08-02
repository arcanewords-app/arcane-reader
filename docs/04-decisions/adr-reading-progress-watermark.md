# ADR: Watermark reading progress

## Status

Accepted (2026-07-18); UX simplified 2026-08-03

## Context

`user_publication_progress` stored two independent signals:

- `read_chapter_ids[]` — per-chapter checklist (not necessarily contiguous)
- `last_read_chapter_id` + `last_read_paragraph_index` — bookmark / paragraph resume

Users confused Continue (bookmark) with read checkmarks. Paragraph position added complexity (visibilitychange, beforeunload, dual restore paths) with little benefit for serialized fiction.

Manual «mark up to here» in TOC/chapter list duplicated jump-ahead confirm. Last-chapter scroll ≥85% auto-complete added implicit progress without an explicit Next.

## Decision

Single **watermark** per `(user_id, publication_id)`:

- `last_read_chapter_number` (int, default 0): chapters with `number <= N` are read
- `last_read_at` for history sort

### Advance rules

| Action                              | Effect                        |
| ----------------------------------- | ----------------------------- |
| **Next** on chapter K               | `N = max(N, K)`               |
| Open chapter K where `K > N + 1`    | Confirm: set progress to K?   |
| Open K where `K <= N` or `K == N+1` | No automatic watermark change |
| Reset                               | `N = 0`                       |

**Continue** opens first chapter with `number > N` and `hasTranslation`, else publication page.

### Jump-ahead confirm

When opening chapter `K > N + 1`, user is asked whether to mark chapters up to K as read.

- **Yes** → `N = K` (set) + navigate to K
- **No** → navigate to K without changing N (deep-link already on K: only close modal)

### TOC / chapter list UI

- Read chapters: muted style (TOC) or check icon (publication page list)
- Watermark chapter N: bookmark icon («read up to here»), not scroll position
- No manual «mark up to here» control — progress advances via Next or jump-confirm Yes
- Filters all / unread / read remain for navigation
- Reset on publication page and in profile/cabinet reading history

### Intentional removals (vs old dual model)

- **Per-chapter mark** (`read_chapter_ids` checklist) and TOC/list «mark up to here»
- **Implicit mark** on chapter leave, middle-chapter 85% scroll, and last-chapter 85% scroll — only **Next** advances via `complete`
- **Bookmark on last opened chapter** → bookmark icon shows watermark chapter N

### Deferred (documented, not removed from DB yet)

- `PATCH /api/publications/:id/reading-position` — paragraph bookmark (returns 410)
- Auth scroll restore from API (`resolveReadingParagraphIndex` server branch)
- Guest/share `?paragraph=` deep links remain for URL resume within a session

Deprecated columns: `read_chapter_ids`, `last_read_chapter_id`, `last_read_paragraph_index`.

## Consequences

- Simpler API: `GET/PATCH/DELETE .../read-progress` (`set` used by jump-confirm Yes; `complete` by Next)
- Ratings eligibility: `lastReadChapterNumber >= 1`
- Profile/catalog show `readCount` = chapters with `number <= N`
- Re-numbering chapters by author may desync watermark; user can reset and re-read via Next / jump-confirm
- Mid-chapter resume is URL-only (`?paragraph=`); Continue opens chapter start

## References

- Plan: `docs/05-plans/reading-progress-watermark.md`
- Domain: `src/shared/reading-progress.ts`
- Service: `src/services/supabase/domains/readerProgress.ts`
