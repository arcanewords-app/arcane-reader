---
status: completed
created: 2026-07-18
---

# Reading progress watermark

## Goal

Replace dual progress model (checklist + bookmark) with one integer watermark per publication.

## Implementation

- Migration: `20260718130000_reading_progress_watermark.sql`
- ADR: `docs/04-decisions/adr-reading-progress-watermark.md`
- Shared logic: `src/shared/reading-progress.ts`
- API: `GET/POST/PATCH/DELETE /api/publications/:id/read-progress`

## Deferred

Paragraph resume (`reading-position`) — see ADR. Guest `?paragraph=` kept for share links.
