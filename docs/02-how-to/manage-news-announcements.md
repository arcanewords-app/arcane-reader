---
type: how-to
status: active
domain: client
stale: false
created: 2026-06-18
updated: 2026-06-18
canonical: .cursor/rules/routing.mdc
---

# How to manage news and announcement banners

Audience: **admin** users. For architecture see [[03-explanation/news-and-announcements]].

## Prerequisites

- Account with `admin` role.
- Supabase migration `20250618_news_and_announcements` applied (see [[05-plans/news-and-announcements]]).

## Create and publish a news post

1. Open **Admin** → tab **News** (`/admin/news`).
2. In **New post**, fill in:
   - **Title** — headline on `/news`.
   - **Summary** — short blurb (list + default banner text).
   - **Body** — markdown (`##` headings, `-` lists, `**bold**`, `[links](url)`).
   - **Category** — feature, discount, update, or other.
   - **Slug** (optional) — lowercase-with-hyphens for `/news/your-slug`.
3. Click **Create post** — status is **Draft**.
4. On the post card, click **Publish**. `published_at` is set; post appears on public `/news`.

Draft posts are **not** visible on the public feed.

## Create an announcement banner from a post

1. On a **published** post, click **Create announcement**.
2. In the modal:
   - **Message** — ≤160 characters (prefilled from summary).
   - **Style** — info, promo, or neutral.
   - **Minimum role** — who sees the banner (e.g. Everyone = guest, Authors = author).
   - **Priority** — higher number wins when multiple alerts are active.
3. Confirm — banner goes live for matching users on next page load.

Default CTA: "Learn more" → `/news/:slug` (or post id if no slug).

## Manage active announcements

Section **Active announcements** on `/admin/news`:

| Action                        | Effect                                                                 |
| ----------------------------- | ---------------------------------------------------------------------- |
| **Activate / Deactivate**     | Toggle `is_active` without deleting                                    |
| **Show again** (bump version) | Increments `content_version`; users who dismissed see the banner again |
| **Delete**                    | Removes alert permanently                                              |

## Delete a news post

1. Deactivate or delete any **active** announcement linked to the post first.
2. Otherwise delete returns **409** (post has active alerts).

## Verify the banner (smoke test)

1. Open the app in a private window (or as a user matching `min_role`).
2. Confirm the strip appears under the header (not when service health banner is showing).
3. Click CTA → full post on `/news/...`.
4. Dismiss with × or Escape — reload; banner should stay gone.
5. In admin, **Show again** on the alert — banner returns after refresh.

## Verify GA4 metrics

Requires `VITE_GA_MEASUREMENT_ID` and user **accepted** cookie banner.

In GA4 → **Reports → Engagement → Events**:

- `announcement_view` — impressions
- `announcement_cta_click` — CTA clicks
- `announcement_dismiss` — dismissals

Filter or explore by custom parameter `announcement_id` to compare campaigns.

## Translate button (not yet available)

**Translate (coming soon)** is disabled in UI. API `POST /api/admin/news/:id/translate` returns 501. Content i18n will use `translations` jsonb when implemented.

## References

- Routes: [[_canonical/rules/routing]]
- Plan (shipped checklist): [[05-plans/news-and-announcements]]
