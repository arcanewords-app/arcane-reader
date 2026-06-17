---
type: plan
status: archived
domain: client
stale: false
created: 2026-06-18
updated: 2026-06-18
canonical: .cursor/rules/routing.mdc
---

# Plan: News feed and announcement banners

## Goal

Ship a two-layer product messaging system:

1. **News feed** — durable content at `/news` (what changed, promos, release notes).
2. **Announcement banner** — short non-modal strip under the header for time-sensitive nudges, with role targeting and dismiss.

Admin manages both from **Admin → News** (`/admin/news`). Dismiss state is hybrid: localStorage for guests, Supabase for authenticated users.

## Shipped (MVP)

- [x] Supabase migration `news_and_announcements` applied (project `arcane`, 2026-06-18)
- [x] Tables: `news_posts`, `announcement_alerts`, `user_announcement_dismissals` + RLS
- [x] Public API: `GET /api/news`, `GET /api/news/:idOrSlug`, `GET /api/announcements/active`, `POST /api/announcements/:id/dismiss`
- [x] Admin API: news CRUD, publish, announcements CRUD, `from-news` helper, translate stub (501)
- [x] Redis cache keys + invalidation on admin mutations
- [x] Client: `NewsPage`, `NewsDetailPage`, `AnnouncementBanner`, `AnnouncementContext`
- [x] Admin: `AdminLayout` tabs (Entities | News), `AdminNewsPage`
- [x] Info menu link to `/news`
- [x] SEO: `/news` in sitemap and static SSR meta; `vercel.json` rewrite
- [x] GA4: `announcement_view`, `announcement_cta_click`, `announcement_dismiss` (cookie consent required)
- [x] i18n UI keys: en, ru, be
- [x] Route map in `.cursor/rules/routing.mdc`

## Out of scope / Phase 2

- [ ] Unread badge on Info menu
- [ ] Hide announcement banner in publication reading mode
- [ ] AI translation (`POST /api/admin/news/:id/translate` — stub returns 501)
- [x] GA dismiss/CTA/view metrics (added post-MVP)

## Edge cases (implemented behavior)

| Scenario                      | Behavior                                                    |
| ----------------------------- | ----------------------------------------------------------- |
| Service down/degraded         | Product banner hidden; `ServiceStatusBanner` takes priority |
| Multiple active alerts        | One shown: highest `priority`, tie-break `starts_at` DESC   |
| Alert expired (`ends_at`)     | Not returned by API                                         |
| Draft news                    | Not in public API; cannot create alert from draft           |
| Delete news with active alert | HTTP 409 — deactivate alert first                           |
| Edit alert after dismiss      | No re-show until admin bumps `content_version`              |
| Guest → login                 | Server dismissals apply; localStorage merge on client       |
| `min_role=author`, guest      | Alert not shown                                             |
| CTA to `/news/...`            | Also fires `page_view` on navigation (expected)             |

## Verification (manual smoke)

1. Admin → News: create post → **Publish**.
2. **Create announcement** from published post (set `min_role`, priority).
3. Open app as target user: banner appears under header.
4. Click CTA → lands on `/news/:slug`; dismiss with × or Escape.
5. Reload: banner stays dismissed (same `content_version`).
6. Admin: **Bump version** → banner reappears for users who dismissed.
7. GA4 (with cookies accepted): see `announcement_view`, `announcement_cta_click`, `announcement_dismiss`.

## Canonical references

- **Routes:** [[_canonical/rules/routing]] (`.cursor/rules/routing.mdc`)
- **Migration:** `docs/supabase-migrations/20250618_news_and_announcements.sql`
- **Schemas:** `src/api/schemas/news.ts`
- **DB layer:** `src/services/supabaseDatabase.ts`
- **Server routes:** `src/server.ts`
- **Client:** `src/client/pages/NewsPage.tsx`, `NewsDetailPage.tsx`, `AdminNewsPage.tsx`, `components/AnnouncementBanner.tsx`, `contexts/AnnouncementContext.tsx`
- **Dismiss:** `src/client/utils/dismissedAlerts.ts`
- **Analytics:** `src/client/utils/analytics.ts`
- **Explainer:** [[03-explanation/news-and-announcements]]
- **Admin how-to:** [[02-how-to/manage-news-announcements]]
