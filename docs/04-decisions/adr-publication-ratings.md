---
type: adr
status: accepted
domain: client
stale: false
created: 2026-07-18
updated: 2026-07-18
canonical: .cursor/skills/ui/PATTERNS.md
---

# ADR: Publication ratings — stars, Bayesian sort, eligibility

## Status

Accepted (2026-07-18)

## Context

The public catalog lists author-published translations. Readers need a familiar quality signal (1–5 stars) without conflating bug reports (`translation_reports`) or AI critic output. Cold-start catalogs need protection from single-vote tops.

## Decision

1. **Variant B:** single 1–5 score per publication per user.
2. **Display threshold:** hide aggregate on cards until `rating_count >= 5`.
3. **Bayesian average for sort:** `(C * m + sum) / (C + n)` with `m = 3.6`, `C = 5` (same as display threshold).
4. **Eligibility:** `requireAuth`; at least one chapter in `user_publication_progress.read_chapter_ids`; reject if `user_id === publications.user_id`.
5. **Storage:** table `publication_ratings`; denormalized `rating_avg`, `rating_count`, `rating_bayesian` on `publications` maintained by trigger; exposed via `publications_list_with_counts`.
6. **UI:** compact meta on cards; full summary + Modal on `/p/:id`; optional reader nudge once per publication (localStorage dismiss).

## Consequences

- List cache keys include `orderBy=rating`.
- Rating mutations invalidate publication + list Redis caches.
- Future text reviews would be a separate table; do not extend `publication_ratings` with review text.
