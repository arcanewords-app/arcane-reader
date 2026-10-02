---
type: plan
status: active
domain: client
stale: false
created: 2026-10-02
updated: 2026-10-02
decision: variant-a
canonical: docs/03-explanation/news-and-announcements.md
---

# Multilingual news and announcements

Research note. **Variant A is the chosen implementation** (jsonb on the same row, shared `/news/:slug`, whole-document fallback to Russian, locales `ru` / `en` / `be` / `pl`, AI draft that does not mark a locale ready). No ADR. SEO stays on the Russian canonical text.

## Problem

The app UI follows the reader's locale. News posts, announcement banners, and the SEO snippet for a post do not. A post is published in one language (today, Russian) and shown in that language on every locale.

That split is the bug. Product changelogs that stay in one language (Linear, Stripe, Vercel) match a one-language product. Arcane's chrome is already multilingual, so a Russian-only post on an English UI reads as unfinished, not as an editorial choice.

Two layers must stay separate:

| Layer             | Where it lives                          | What it is                                      |
| ----------------- | --------------------------------------- | ----------------------------------------------- |
| UI chrome         | `src/client/locales/*.json` via i18next | Buttons, empty states, category labels          |
| Editorial content | `news_posts`, `announcement_alerts`     | Title, summary, body, banner message, CTA label |

Do not put post bodies in locale JSON files. Do not treat UI strings as rows in `news_posts`.

## Current behavior

Verified against `src/` on 2026-10-02. Human overview: [[03-explanation/news-and-announcements]]. Admin steps: [[02-how-to/manage-news-announcements]]. Shipped MVP: [[05-plans/news-and-announcements]] (archived).

### UI locale

`src/client/i18n.ts`: `SUPPORTED_LOCALES` is `ru`, `en`, `be`, `pl`. Default and `fallbackLng` are `ru`. Resolution: `localStorage` key `app.locale`, then `navigator.languages`, then `ru`. `document.documentElement.lang` follows the choice.

Older notes that list only `ru` / `en` ([[05-plans/multilingual-ui-audit]], the "Currently implemented" line in [[project-status]]) are behind this file. Content locales should follow `SUPPORTED_LOCALES`, not those notes.

Feed chrome is already localized: `news.title`, `news.intro`, `news.empty`, `news.notFound`, category keys. The article itself is not.

### Post storage

`news_posts` columns that carry text: `title`, `summary`, `body` (markdown, max 50_000 in Zod). Also `primary_locale` (text) and `translations` (jsonb).

`createNewsPost` always writes `primary_locale: 'ru'` and `translations: {}`. Updates never touch either field. Public and admin reads return the raw columns. `NewsPage` and `NewsDetailPage` render `post.title`, `post.summary`, and `post.body` with no locale lookup.

`translations` is reserved and unused. A unit test only checks that a sample `{ en: { title: 'Release' } }` round-trips through the row mapper. There is no agreed shape.

Slug is one English kebab-case string per post (`new-language-pairs`). It is the public identity, not a translated field. Draft workflow: `.cursor/skills/news-content/SKILL.md` — body copy is Russian; slug stays English.

### Announcements

`announcement_alerts` has `message` (≤160), `cta_label` (≤60), `cta_url`, and an optional `news_post_id`. No locale column and no jsonb.

`resolveAlertMessage` uses the alert message, then the linked post summary, then empty, then truncates to 160 characters. The banner the reader sees is that single string.

Dismiss is `(alert id, content_version)` in `user_announcement_dismissals` and in `localStorage` key `arcane:dismissed-alerts:v1`. It is not per locale. Raising `content_version` shows the banner again after dismiss. A translation-only edit must not do that, or every language switch / translation save re-opens a banner the reader already closed.

### Translate stub

`POST /api/admin/news/:id/translate` returns 501. The admin button is disabled (`admin.news.translateSoon`). The client method `translateNewsPost` is typed `Promise<never>`.

### SEO and cache

`GET /news/:slugOrId` SSR (`src/api/routes/seo.ts`) injects `post.title` and `post.summary`. The description fallback string is hardcoded Russian: `` `${post.title} — новости Arcane` `` (same string in `NewsDetailPage`). Sitemap lists one URL per post. No `hreflang`. The rest of the SPA has no locale prefix either.

Redis prefixes in `src/shared/cacheContract.ts`: `public:news:list`, `public:news:post`, `public:announcements:active`. Keys do not include a locale, which is correct only while each row has one text.

## Design axes

These four choices are independent. A variant is one combination, not a single feature flag.

1. **Storage.** Jsonb on the existing row, a child translation table, a separate post per language, or a column per language.
2. **Who writes.** A human per locale, an AI draft a human marks ready, or an automatic publish of the machine translation.
3. **Gaps.** The whole document falls back to the primary locale, each field falls back on its own, or the post is hidden until every locale exists.
4. **URL.** One `/news/:slug` plus the app locale, or a locale prefix (`/en/news/:slug`) for `hreflang`.

## What other products do

### Contentful — field-level vs entry-level

[Field and entry localization](https://www.contentful.com/help/localization/field-and-entry-localization/):

- **Field-level.** One entry. Localized fields share one structure. Fallback is a configured chain (empty Canadian French → France French). Fits content that is published in several languages with the same shape.
- **Entry-level.** One entry per market, linked as a group. Each market can diverge. Fallback is harder because structure can differ. Fits regionalization, not a straight translation.
- **Content-type-level and space-level.** A copy of the schema, or a whole space, per locale. Too heavy for four app locales and one admin.

Field-level used to publish every locale together. [Locale-based publishing](https://www.contentful.com/blog/regional-control-global-reach-locale-based-publishing/) exists because teams wanted field-level structure and independent publish per language. Arcane does not need independent publish for v1: one post status (`draft | published | archived`) plus a per-locale ready flag is enough.

### Ghost and WPML — one document per language

Ghost has one language per site unless you fake more. Crisp's write-up ([multilingual Ghost](https://crisp.chat/en/blog/how-we-made-our-ghost-blog-multilingual-to-leverage-our-seo/)) uses a collection and an internal tag per language, locale URLs, and English posts still listed on other locales. A Ghost forum thread describes the same idea with a grouping tag plus a language tag so a theme can emit `hreflang`. WPML's translation group is the same pattern in WordPress: separate posts, shared group id, locale in the URL.

That model pays off when each language is an SEO URL and markets edit on their own. It fights Arcane's current slug-as-identity and the unprefixed SPA.

### Postgres — jsonb vs a translation table

For a handful of locales, a common pattern is: default-locale text stays in normal columns; other locales live in one jsonb document on the same row. Reads do not join. Adding a locale does not need a migration. See the JSON-column side of [drizzle-i18n](https://github.com/HishamM1/drizzle-i18n) and the [IntlPull localization note](https://intlpull.com/guides/database-content-localization).

A child table `(entity_id, locale)` unique wins when you need per-locale status and timestamps as real columns, full-text search per language, many locales, or "which posts lack Polish?" as a cheap query. Row size is not the reason to switch: four markdown bodies at the 50k cap are a TOAST concern, not a reason to split for four short posts.

Column-per-language (`title_en`, `title_pl`) needs a migration for every new locale. Reject it.

### Changelogs and the novel pipeline

Linear, Stripe, and Vercel changelogs are English because the product UI is English. Copying that "one language" policy would freeze the current bug.

Do not run news copy through the chapter pipeline (`src/engine/`, glossary, language pairs, chunking). That pipeline is for fiction: glossary locks, pair prompts, paragraph alignment. A news post is short markdown in the technical-startup voice from `.cursor/skills/news-content/SKILL.md`. A later AI assist should be a separate, small prompt that preserves markdown structure (headings, tables, links, fenced code) and does not invent product facts. It must not mark a locale ready.

## Rejected

| Approach                                   | Why not                                                                                                            |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------ |
| Column per language                        | A migration every time `SUPPORTED_LOCALES` grows.                                                                  |
| Post bodies in `en.json` / `ru.json`       | Editorial content is admin-authored and cached in Redis. Locale files are UI chrome, shipped with the client.      |
| Field-by-field fallback on the public page | An English title over a Russian body looks broken. Contentful allows it; we should not.                            |
| Auto-publish machine translation           | The news voice is specific. A bad translation on a banner (≤160 chars) is worse than showing Russian with a label. |
| Novel translation pipeline                 | Wrong glossary, wrong prompts, wrong unit of text.                                                                 |

## Variant A — jsonb on the same row (recommended)

One post, one slug, one URL. Canonical text stays in `title`, `summary`, and `body` and is the `primary_locale` (keep creating posts as `ru`). Other app locales live entirely inside `translations`.

```json
{
  "en": {
    "title": "",
    "summary": "",
    "body": "",
    "status": "draft"
  }
}
```

`status` on a locale is `draft` or `ready`. It is not the post's `draft | published | archived`.

**Show a locale only when** `status` is `ready` and both `title` and `summary` are non-empty. Body may be empty, matching today's posts. Otherwise show the whole primary document. Do not mix fields across locales.

**Reader hint** when the fallback fires: a short UI-chrome string ("Shown in Russian"), localized via i18next. Whether that hint ships in v1 is an open question below; the fallback behavior itself is part of the variant.

**Banner.** Add the same kind of jsonb for `message` and `cta_label` only. `cta_url` stays shared (`/news/:slug` is not translated). If the banner has no message and borrows the post summary, borrow the summary in the resolved locale (or primary, if that locale is not ready). Saving a translation does not increment `content_version`.

**Admin.** Locale tabs bound to `SUPPORTED_LOCALES`. The primary tab edits the real columns. Other tabs edit one jsonb entry. Publishing the post is unchanged. A locale can stay `draft` on a published post; readers of that locale see Russian.

**AI button.** Implements the 501 stub: fill one target locale's title, summary, and body as `draft`. A human sets `ready`. The button does not publish and does not bump banner `content_version`.

**API.** Public news and the active announcement accept the app locale (client sends `i18n.language`). The handler resolves one text and returns it, plus a flag that fallback happened so the client can show the hint. List payloads stay title + summary for one locale, not every body. Admin APIs keep returning the raw columns and the full jsonb so the tabs can edit.

**Cache.** Suffix `public:news:list`, `public:news:post`, and `public:announcements:active` with the locale. Invalidation on admin write stays "drop the post / list / active alert", across locales. Language switch refetches; that matches a locale-scoped key. Returning every body to the client to avoid a refetch is the wrong trade for a 50k body times four locales on the list.

**URL and SEO.** Keep `/news/:slug`. SSR and Open Graph stay on the primary locale in v1, because the crawler does not share the reader's `app.locale`. Do not add `hreflang` until the whole SPA grows a locale prefix. Serving different HTML for the same URL from `Accept-Language` would be a second language on one URL without a clean alternate, and it fights the cache.

**Existing rows.** No backfill. Current columns are already the Russian canonical text. `translations` stays `{}` until someone fills a locale.

**Fits** the reserved columns, four locales, one admin author, and the current slug. **Does not fit** a world where English must go live while Russian stays draft, or where admin search must match English text in v1. Admin search is `title` / `summary` `ilike` on the primary columns only. Searching jsonb can wait.

## Variant B — translation table

`news_post_translations (post_id, locale)` unique, with `title`, `summary`, `body`, `status`, and timestamps. Optional twin for alert `message` and `cta_label`. Same URL, same whole-document fallback to `ru`, same "AI writes draft" rule.

Choose B instead of A when any of these become real:

- more than one translator, and you want row-level audit of who saved Polish
- full-text search per language
- "posts missing this locale" as a first-class admin filter
- per-locale publish time that is not the post's `published_at`

Until then the extra table, RLS, and joins duplicate what jsonb already reserves. Public read volume is a short list of posts, not a catalog.

## Variant C — one post per language, locale in the URL

Ghost / WPML shape: a translation group id, one row (or one slug) per locale, public path `/en/news/:slug`. `hreflang` alternates point at siblings. `x-default` is Russian. Fallback is "also show the Russian post in this locale's list" or "hide it".

Choose C only if `/news` becomes an indexed content hub and search snippets in each language are a product goal. It breaks today's single slug, splits analytics and dismiss identity, and is the only variant that wants a locale prefix the rest of the app does not have.

[Contentful's international SEO note](https://www.contentful.com/seo-guide/international-seo/): `hreflang` belongs on distinct URLs, each page listing itself and the alternates, plus optional `x-default`. Google does not use `html lang` alone to pick the language. That machinery is wasted on one shared `/news/:slug`.

## Comparison

|                            | A jsonb                         | B child table                                | C separate posts                  |
| -------------------------- | ------------------------------- | -------------------------------------------- | --------------------------------- |
| URL                        | `/news/:slug`                   | `/news/:slug`                                | `/en/news/:slug`                  |
| Fallback                   | whole document → `ru`           | same                                         | per list/query, easy to get wrong |
| Per-locale publish         | ready flag only                 | ready flag, real columns                     | full post status                  |
| Schema change              | jsonb shape only; columns exist | new table(s) + RLS                           | group id, unique slug per locale  |
| Admin search in English    | not in v1                       | natural                                      | natural                           |
| SEO alternates             | defer                           | defer                                        | the point of the variant          |
| Migration of current posts | none                            | copy primary into a `ru` row or keep columns | one row already, others new       |

## Open questions

These do not block the research note. They should be answered before an implementation plan:

1. Ship the "Shown in Russian" hint in v1, or fall back silently?
2. Is the banner CTA label translated in v1, or only `message` (and borrowed summary)?
3. Does the first implementation include the AI draft button, or only manual locale tabs (leave 501 until a follow-up)?
4. Does v1 touch SEO at all, or leave SSR on the primary title until a locale-prefix decision?
5. Confirm content locales are exactly `SUPPORTED_LOCALES` (`ru`, `en`, `be`, `pl` today), including Belarusian and Polish, not only `ru` / `en`.

## Appendix — if Variant A is chosen

Sketch only. Not a task list and not a commitment.

**Shape.** Zod for one locale object: `title` ≤200, `summary` ≤300, `body` ≤50_000, `status` enum `draft | ready`. Keys limited to `SUPPORTED_LOCALES` except `primary_locale`. Reject a `ready` locale with empty title or summary. Primary columns remain the source for `ru`; do not also store `ru` inside `translations`.

**Read path.** A pure function: given post, requested locale, and primary locale, return `{ title, summary, body, locale, fellBack }`. Same idea for an alert: requested message and CTA label, else primary, else linked summary in that same resolved locale. Unit-test that function before any route work. Public handlers call it. Admin handlers do not.

**Write path.** Admin patch can update primary fields and/or one locale key (jsonb merge of that key, not a replace of the whole object from a partial client). Translate route writes one key as `draft` and never sets post `status`.

**Banner version.** Translation writes must not change `content_version`. Document that next to the bump-version control so an admin does not "fix" a translation by bumping.

**Client.** News list, detail, and announcement fetch pass the current i18n language and refetch when it changes. Hint string is a UI key, not part of the post. `NewsDetailPage` description fallback loses the hardcoded Russian suffix once the resolved summary is always present; the SSR twin in `seo.ts` stays Russian until question 4 is decided.

**Cache.** Locale suffix on the three public prefixes. Admin mutations invalidate every locale variant of those keys.

**Tests, when implemented.** Pure resolver unit tests (ready locale, draft locale, missing key, empty title, banner borrow). Schema contract for the jsonb object. One admin integration case that saving `en` does not change the public Russian payload and does not change `content_version`. Component test that a `fellBack` flag renders the hint. No Playwright requirement for the first slice.

**Docs after implementation, not now.** Update [[03-explanation/news-and-announcements]] and [[02-how-to/manage-news-announcements]]. Point `.cursor/skills/news-content/SKILL.md` at locale tabs. This note becomes `status: archived` or is replaced by a short decision ADR.

## Related

- [[03-explanation/news-and-announcements]]
- [[02-how-to/manage-news-announcements]]
- [[05-plans/news-and-announcements]]
- [[05-plans/multilingual-ui-audit]] — UI strings only; this note does not extend that audit
- Code: `src/storage/types.ts` (`NewsPost`, `AnnouncementAlert`), `src/services/supabase/domains/news.ts`, `src/services/supabase/pure/announcements.ts`, `src/api/schemas/news.ts`, `src/api/routes/seo.ts`, `src/client/i18n.ts`
