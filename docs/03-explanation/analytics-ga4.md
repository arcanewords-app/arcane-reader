# Google Analytics 4 (GA4)

Client-side analytics via `gtag.js`. Helpers: `src/client/utils/analytics.ts`.

## Prerequisites

1. `VITE_GA_MEASUREMENT_ID=G-XXXXXXXX` set at **build time** (Vercel env + redeploy).
2. User **accepted** analytics cookies (cookie banner or Privacy → reset + accept).
3. No ad blocker blocking `googletagmanager.com`.

## Cookie consent

- Storage: `localStorage` key `arcane:cookie-consent` (JSON with `status`, `at`, `policyVersion`).
- **Accept** → GA loads on next effect cycle in `AppRouter`.
- **Reject** → banner hidden for **30 days**, then shown again.
- **Not chosen** → banner on every visit until accept/reject.
- **Privacy** (`/privacy`) → «Reset cookie preference» clears choice; banner returns on navigation.

Cookie banner uses `z-index: 1300` so it stays above reading mode.

## Events

| Event                                                                 | When                                               | Key parameters                                                          |
| --------------------------------------------------------------------- | -------------------------------------------------- | ----------------------------------------------------------------------- |
| `page_view`                                                           | After consent + each SPA route change              | `page_path`, `page_title`                                               |
| `view_item`                                                           | Open publication / project page                    | `item_id`                                                               |
| `select_content`                                                      | Catalog / project card click                       | `content_type`, `item_id`                                               |
| `login`, `sign_up`, `logout`                                          | Auth flows                                         | —                                                                       |
| `chapter_translate`                                                   | Start chapter translation (author)                 | `project_id`, `chapter_id`                                              |
| `export`                                                              | Download EPUB/FB2                                  | `format`                                                                |
| `support_click`                                                       | Boosty link                                        | `platform`                                                              |
| `announcement_view`, `announcement_cta_click`, `announcement_dismiss` | News banner                                        | `announcement_id`, `variant`, `content_version`                         |
| `reading_start`                                                       | First chapter open per publication/project session | `mode`, `publication_id` / `project_id`, `chapter_id`, `chapter_number` |
| `chapter_complete`                                                    | Watermark complete (next chapter, scroll end, TOC) | same as above                                                           |
| `scroll_depth`                                                        | Scroll thresholds 25/50/75/100% per chapter        | `scroll_percent`, `chapter_id`, `mode`                                  |
| `CLS`, `INP`, `LCP`                                                   | Web Vitals after consent                           | Web Vitals standard                                                     |

Events before `initGA()` are dropped (no queue).

## Smoke test (production)

1. Incognito window, disable ad blockers.
2. Open site → click **Accept** on cookie banner.
3. DevTools → Network → filter `google` → expect `gtag/js?id=G-…` and `collect` / `g/collect`.
4. GA4 → **Reports → Realtime** → `page_view` within ~30s.
5. Open a publication → `view_item`; start reading → `page_view` on `/p/…/reading` + `reading_start`.
6. Scroll chapter → `scroll_depth` at 25/50/75/100%.
7. Complete chapter → `chapter_complete`.

## Verify build embeds measurement ID

After deploy: DevTools → Sources → search minified JS for your `G-` ID. If missing, env was not set during `npm run build:client`.

## Related

- Cookie UI: `src/client/components/CookieBanner/`
- Consent logic: `src/client/utils/cookieConsent.ts`
- Reading hooks: `src/client/components/ReadingMode/index.tsx`
- Deployment env: `.cursor/rules/deployment.mdc`
