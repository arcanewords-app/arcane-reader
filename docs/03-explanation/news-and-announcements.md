---
type: explanation
status: active
domain: client
stale: false
created: 2026-06-18
updated: 2026-10-02
canonical: .cursor/rules/routing.mdc
---

# News feed and announcement banners

## Overview

Arcane has two related but separate surfaces for product messaging:

| Layer                   | User-facing                            | Purpose                                                        |
| ----------------------- | -------------------------------------- | -------------------------------------------------------------- |
| **News feed**           | `/news`, `/news/:slugOrId` (Info menu) | Full posts: release notes, features, promos. Always browsable. |
| **Announcement banner** | Horizontal strip under header          | Short message (≤160 chars) + optional CTA. Dismissible.        |

A news post can spawn a banner via admin **Create announcement**, but the feed does not track "read" state separately — the banner is the proactive nudge; the feed is the archive.

Route map (SSOT): [[_canonical/rules/routing]].

## Architecture

```mermaid
flowchart TB
  subgraph admin [Admin UI]
    AdminNews["/admin/news"]
    Entities["/admin/entities"]
  end

  subgraph api [Express API]
    PublicNews["GET /api/news"]
    ActiveAlert["GET /api/announcements/active"]
    Dismiss["POST /api/announcements/:id/dismiss"]
    AdminCRUD["/api/admin/news and announcements"]
  end

  subgraph db [Supabase]
    news_posts[(news_posts)]
    alerts[(announcement_alerts)]
    dismissals[(user_announcement_dismissals)]
  end

  subgraph client [SPA]
    Feed["/news"]
    Banner[AnnouncementBanner]
    LS[localStorage guests]
  end

  AdminNews --> AdminCRUD --> db
  PublicNews --> news_posts
  ActiveAlert --> alerts
  Dismiss --> dismissals
  alerts --> Banner
  dismissals --> Banner
  LS --> Banner
  news_posts --> Feed
```

## Data model

### `news_posts`

Published posts are public (RLS: `status = 'published'`). Drafts and archived posts are admin-only (service role).

Key fields: `title`, `summary`, `body` (markdown), `category` (`feature` | `discount` | `update` | `other`), `slug`, `published_at`. `primary_locale` is `ru` and those columns are the canonical text. `translations` jsonb holds `en` / `be` / `pl` as whole documents (`title`, `summary`, `body`, `status`: `draft` | `ready`). A locale is public only when `ready` and both title and summary are set. Otherwise the reader sees the Russian document and `fellBack: true`. Russian is not stored inside `translations`.

### `announcement_alerts`

Short banner config. Optional `news_post_id` FK. Schedule via `starts_at` / `ends_at`. `min_role` gates audience. `content_version` increments when admin wants to re-show after dismiss. `priority` picks the single active alert when several qualify. `message` and `cta_label` are the Russian copy. `translations` jsonb holds the same two fields for `en` / `be` / `pl`. Saving a translation does not change `content_version`. If the locale has no message, the banner uses the Russian message, then the news summary already resolved for that locale.

### `user_announcement_dismissals`

Per-user record: `(user_id, announcement_id)` + `content_version` at dismiss time. RLS: user owns row only.

Migration: `docs/supabase-migrations/20250618_news_and_announcements.sql` (applied to Supabase project `arcane`, 2026-06-18).

## Dismiss flow

```mermaid
sequenceDiagram
  participant Client
  participant LS as localStorage
  participant API
  participant DB

  Client->>API: GET /api/announcements/active
  API->>DB: filter by role schedule dismissals
  API-->>Client: candidate or null
  Client->>LS: check arcane dismissed-alerts v1
  Client->>Client: render AnnouncementBanner

  Note over Client: user dismisses
  Client->>LS: save alertId plus contentVersion
  alt authenticated
    Client->>API: POST dismiss
    API->>DB: upsert user_announcement_dismissals
  end
```

**localStorage key:** `arcane:dismissed-alerts:v1` — `{ schemaVersion: 1, items: { [alertId]: contentVersion } }`.

**Re-show:** Admin bumps `content_version` on the alert. Client treats stored version as stale and shows banner again; GA fires a new `announcement_view`.

## Role targeting

`min_role` on alerts uses the same hierarchy as [[_canonical/rules/auth]] (`guest` < `user` < `author` < … < `admin`). Unauthenticated visitors are `guest`. API filters alerts where `isAtLeastRole(userRole, min_role)`.

## Banner UX rules

- Non-modal horizontal bar (same band as `ServiceStatusBanner`).
- **Hidden** when service health banner is active (down/degraded).
- At most **one** banner: highest `priority` wins.
- `role="region"` (not `role="alert"`) for promo content.
- Dismiss: × button, Escape (when dismissible), min 44px touch target.
- Max one CTA button (e.g. "Learn more" → `/news/:slug`).

Implementation: `src/client/components/AnnouncementBanner.tsx`, `src/client/contexts/AnnouncementContext.tsx`.

## Analytics (GA4)

Events fire only after cookie consent (`VITE_GA_MEASUREMENT_ID` + user accepts cookies). Helpers in `src/client/utils/analytics.ts`:

| Event                    | When                               | Parameters                                      |
| ------------------------ | ---------------------------------- | ----------------------------------------------- |
| `announcement_view`      | Banner shown (once per id+version) | `announcement_id`, `variant`, `content_version` |
| `announcement_cta_click` | CTA clicked                        | + `cta_url`                                     |
| `announcement_dismiss`   | Dismiss (× or Escape)              | `announcement_id`, `variant`, `content_version` |

Internal navigation to `/news/...` also records a normal `page_view`.

## i18n

- **UI labels:** `src/client/locales/en.json`, `ru.json`, `be.json`, `pl.json`.
- **Post and banner content:** the public API takes `locale` (default `ru`) and returns one resolved text plus `fellBack`. SSR and the sitemap stay on the Russian columns. No `hreflang`.
- **Admin:** locale tabs on the post and on the banner. `POST /api/admin/news/:id/translate` writes a `draft` for `en` / `be` / `pl` and returns 409 if that locale is already `ready`.
- Research and the chosen model: [[05-plans/news-multilingual]].

## Related

- Admin operations: [[02-how-to/manage-news-announcements]]
- Archived plan: [[05-plans/news-and-announcements]]
