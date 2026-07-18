---
type: plan
status: active
domain: client
stale: false
created: 2026-07-18
updated: 2026-07-18
canonical: .cursor/skills/ui/PATTERNS.md
---

# Plan: Publication ratings (stars 1–5)

## Goal

Readers rate published translations on a 1–5 scale after reading. Aggregates appear on catalog cards and publication pages; catalog can sort by Bayesian score.

## Model

- One score per `user × publication` (upsert).
- Display threshold: **≥ 5** votes before showing avg on cards.
- Eligibility: authenticated, `lastReadChapterNumber >= 1`, not publication owner.
- Sort: Bayesian average (prior mean 3.6, C = 5); publications below threshold sort last.

## Deliverables

- [x] UI patterns in `.cursor/skills/ui/PATTERNS.md`
- [x] ADR: [[04-decisions/adr-publication-ratings]]
- [ ] Migration `publication_ratings` + view `publications_list_with_counts` columns
- [ ] API: `PUT/DELETE /api/publications/:id/rating`, `GET` aggregates on list/detail
- [ ] Client: `PublicationRatingMeta`, `PublicationRatingSummary`, `RatePublicationModal`
- [ ] Catalog sort chip + URL `sort=rating`
- [ ] Reader one-shot nudge after first chapter read
- [ ] i18n en / ru / be

## Out of scope (v1)

- Text reviews, dual-axis (story vs translation), likes.
- Public author rating leaderboard.

## References

- Patterns: `publication-rating-*`, `catalog-sort-by-rating` in PATTERNS.md
- Reports remain separate (`translation_reports`)
