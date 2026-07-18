# Arcane Reader — UX/UI Pattern Cookbook

Living reference for **proven UI solutions** in this repo. Use before inventing new filter bars, chips, or layout patterns.

**Hierarchy:** code (`src/client/`) is behavior SSOT → [`design-system.mdc`](../../rules/design-system.mdc) is token/policy SSOT → **this file** is recipe SSOT for feature-level UX.

## When agents should read this

- New or redesigned filters, toolbars, chip rows, segmented controls
- Catalog, dashboard, list pages with search + secondary controls
- Cover badges, compact icon toggles, responsive filter bars
- After shipping a UI change the team liked — **add an entry here** in the same PR (or follow-up)

## How to add a pattern

1. Copy the [entry template](#entry-template) at the bottom.
2. Pick a **kebab-case id** (e.g. `catalog-filter-toolbar`).
3. Link **real files** — component, CSS, page that composes it.
4. State **when to use / when not**, breakpoints, i18n keys, a11y.
5. Add one line to the [index](#pattern-index).

Do **not** duplicate full token lists from `design-system.mdc` — link there instead.

---

## Pattern index

| Id                           | Summary                                         | Reference                            |
| ---------------------------- | ----------------------------------------------- | ------------------------------------ |
| `catalog-filter-toolbar`     | Icon chips: language, complete, sort segment    | `CatalogFilterToolbar.tsx`           |
| `filter-icon-chip`           | 44px square chip, icon or short code            | `CatalogFilterToolbar.css`           |
| `filter-segment-control`     | Connected toggle pair (sort direction)          | `CatalogFilterToolbar.css`           |
| `responsive-filter-bar`      | Search + toolbar: 2 rows mobile, 1 row tablet+  | `HomePage.css`                       |
| `entity-filter-chips`        | Removable URL-driven filter tags                | `HomePage.tsx` / `.home-entity-chip` |
| `header-locale-control`      | App language: icon + code + dropdown            | `Header.tsx`                         |
| `header-support-control`     | Support via Boosty: icon + label, direct link   | `Header/SupportMenu.tsx`             |
| `cover-status-badge`         | Absolute badge on publication cover             | `PublicationStatusBadge.tsx`         |
| `publication-original-link`  | Compact external link to source on `/p/...`     | `PublicationPage.tsx`                |
| `cover-rating-badge`         | Compact ★ avg pill on cover top-right           | `PublicationRatingCoverBadge.tsx`    |
| `publication-rating-summary` | Full stars + CTA on `/p/:id`                    | `PublicationRatingSummary.tsx`       |
| `publication-rating-input`   | Modal 1–5 star rating input                     | `RatePublicationModal.tsx`           |
| `catalog-sort-by-rating`     | Icon chip: sort catalog by Bayesian rating      | `CatalogFilterToolbar.tsx`           |
| `admin-section-layout`       | Admin CRUD: intro, flash, sections, sub-tabs    | `components/Admin/`                  |
| `reading-history-card`       | Profile reading history: PublicationCard + meta | `ReadingHistorySection.tsx`          |

---

## `catalog-filter-toolbar`

**When:** Public list page needs search plus compact filters without visual noise (mixed buttons, selects, text).

**Compose:** `HomePage` → search `Input` + `<CatalogFilterToolbar />`.

**Toolbar order (left → right):** language chips → complete toggle (if any) → sort segment.

| Group    | Control                                                    | Active state                                                          |
| -------- | ---------------------------------------------------------- | --------------------------------------------------------------------- |
| Language | `language` icon = all; then `RU`, `BE`, … from loaded data | `catalog-filter-chip--active` (accent)                                |
| Complete | `check_circle` icon only                                   | `catalog-filter-chip--complete.catalog-filter-chip--active` (success) |
| Sort     | `arrow_downward` / `arrow_upward` segment                  | `catalog-filter-segment-btn--active` (accent)                         |

**Files:**

- [`src/client/components/Home/CatalogFilterToolbar.tsx`](../../../src/client/components/Home/CatalogFilterToolbar.tsx)
- [`src/client/components/Home/CatalogFilterToolbar.css`](../../../src/client/components/Home/CatalogFilterToolbar.css)
- [`src/client/pages/HomePage.tsx`](../../../src/client/pages/HomePage.tsx) — state + `useMemo` filtering

**UX rules:**

- Binary filters → icon chip or segment, **not** `<Select>`.
- Long labels → `title` + `aria-label`; visible UI stays icon or 2-letter code.
- Show complete filter only when `publications.some(p => p.translationStatus === 'complete')`.
- Language chips: **dynamic** from catalog data, not full `language.*` enum.

**i18n:** `home.languageAll`, `home.targetLanguageLabel`, `home.filterCompleteOnlyAria`, `home.orderNewest`, `home.orderOldest`, `language.{code}`.

---

## `filter-icon-chip`

**When:** Single filter toggle or single-select option in a dense toolbar.

**Specs:**

- `min-width` / `min-height`: **44px**
- Default: `var(--bg-secondary)`, `var(--border)`, `var(--radius-md)`
- Active (neutral): `var(--accent)` fill, white text
- Active (success semantic): `var(--success)` — only for “complete / done” affordance
- `aria-pressed`, `title`, `aria-label` required for icon-only chips

**Reference:** `.catalog-filter-chip` in `CatalogFilterToolbar.css`.

**Do not:** Mix chip sizes with full text buttons and dropdowns in the same toolbar row.

---

## `filter-segment-control`

**When:** Exactly two mutually exclusive options (e.g. sort direction).

**Specs:**

- Wrapper: `.catalog-filter-segment` — single border, `overflow: hidden`
- Buttons: no gap between segments; shared outer radius
- Icons: `arrow_downward` = newest first, `arrow_upward` = oldest first

**Reference:** `.catalog-filter-segment` / `.catalog-filter-segment-btn` in `CatalogFilterToolbar.css`.

**Do not:** Use for 3+ options — use chip row or tabs instead.

---

## `responsive-filter-bar`

**When:** Page has primary search + secondary filter toolbar.

**Layout:**

| Viewport         | Breakpoint | Layout                                                  |
| ---------------- | ---------- | ------------------------------------------------------- |
| Phone            | `< 768px`  | Column: search full width, toolbar below                |
| Tablet + desktop | `≥ 768px`  | Row: search `flex: 1 1 240px`, toolbar `flex-shrink: 0` |

**Files:** `.home-filters` in [`HomePage.css`](../../../src/client/pages/HomePage.css).

**Extra:** On tablet+, cap language chip scroll area: `.catalog-filter-lang-group { max-width: min(240px, 35vw); }` so search keeps space.

**Mobile-first:** Base styles = column; widen with `@media (min-width: 768px)`.

---

## `entity-filter-chips`

**When:** Active filters come from URL (`?author=`, `?translator=`, `?tag=`) and must be clearable.

**Specs:**

- Row below main filters: `.home-entity-filters`
- Chip: label + `×` remove; “Clear all” text button
- Sync with `preact-router` query params

**Reference:** [`HomePage.tsx`](../../../src/client/pages/HomePage.tsx) — `entityFilter`, `buildCatalogUrl`.

**Do not:** Mix entity chips into the icon toolbar — keep contextual chips on their own row.

---

## `header-locale-control`

**When:** Choosing **app UI locale** (ru/en/be), not publication target language.

**Specs:** `Icon language` + uppercase code; dropdown with full names.

**Reference:** [`Header.tsx`](../../../src/client/components/Header.tsx), `.header-locale-*` in `Header.css`.

**Catalog language chips** mirror the **compact code + icon** idea but use single-select chips instead of dropdown — see `catalog-filter-toolbar`.

---

## `header-support-control`

**When:** Project accepts tips via Boosty. `VITE_SUPPORT_BOOSTY_URL` must be set.

**When not:** No env URL configured (control hidden). Reading mode chrome (use global header only in v1).

**Files:**

- [`src/client/components/Header/SupportMenu.tsx`](../../../src/client/components/Header/SupportMenu.tsx)
- [`src/client/constants/supportLinks.ts`](../../../src/client/constants/supportLinks.ts)
- `.header-support-btn` / `.header-support-label` in [`Header.css`](../../../src/client/components/Header.css)

**Behavior:** Icon + label button → direct `window.open` to Boosty in a new tab. Hidden when URL is missing.

**Specs:** `Icon local_cafe` + label; mobile and tablet (≤1023px) icon-only 44px; warm hover on `.header-support-btn` (warning tint, not primary).

**Env:** `VITE_SUPPORT_BOOSTY_URL` (https only; append `?locale=ru_RU` for Russian Boosty UI). See `env.example.txt`.

**i18n:** `support.menu`, `support.menuAria` in `en.json`, `ru.json`, `be.json`.

**a11y:** `aria-label` + `title` on icon-only mobile.

**Analytics:** `support_click` GA event with `{ platform: 'boosty' }` when cookies accepted.

**Do not:** Bury support only in Info menu; add multi-platform dropdown without explicit product decision.

---

## `cover-status-badge`

**When:** Translator-set status on publication cover in catalog and publication page.

**Specs:**

- `position: absolute` on cover container; `pointer-events: none`
- `complete` → `--success`; keep badge set minimal for catalog clarity (prefer only `complete` visible when product is binary)

**Reference:** [`PublicationStatusBadge.tsx`](../../../src/client/components/Home/PublicationStatusBadge.tsx).

---

## `publication-original-link`

**When:** Published work has an optional link to the original source (web novel, official page). Shown to readers on the publication page only — not on catalog cards.

**When not:** Catalog grid cards; use author workspace (`ProjectInfo` publication section) to edit the URL.

**Files:**

- [`src/client/pages/PublicationPage.tsx`](../../../src/client/pages/PublicationPage.tsx)
- [`src/client/pages/PublicationPage.css`](../../../src/client/pages/PublicationPage.css) — `.publication-page-source-link`
- [`src/client/components/ProjectInfo.tsx`](../../../src/client/components/ProjectInfo.tsx) — editable `metadata.sourceUrl`, sync on publish/update

**Layout / behavior:**

- Render inside `publication-page-actions` when `publication.sourceUrl` is set.
- `<a target="_blank" rel="noopener noreferrer">` with `Icon name="open_in_new"` + short label.
- Style matches `publication-page-toc-btn` (bordered secondary chip, inline-flex, gap).

**Data flow:** Author saves `projects.metadata.sourceUrl` → `POST /api/projects/:id/publish` copies to `publications.source_url` → public GET returns `sourceUrl`.

**i18n:** `publication.originalLink`; author labels under `projectInfo.sourceUrl*`.

**a11y:** Visible text label (not icon-only); `focus-visible` outline; external link opens new tab.

**Anti-patterns:** Inline URL in description; icon-only without label; showing on catalog cards (clutters grid).

---

## `cover-rating-badge`

**When:** Show aggregate publication rating on catalog cards and publication page cover (top-right), mirroring `cover-status-badge` on the left.

**When not:** Chapter rows; count &lt; display threshold (5); interactive rating; count text on the pill; five-star row on cover.

**Files:**

- [`src/client/components/Home/PublicationRatingCoverBadge.tsx`](../../../src/client/components/Home/PublicationRatingCoverBadge.tsx)
- [`src/client/components/Home/PublicationCard.tsx`](../../../src/client/components/Home/PublicationCard.tsx) — inside `.publication-card-cover`
- [`src/client/pages/PublicationPage.tsx`](../../../src/client/pages/PublicationPage.tsx) — inside `.publication-page-cover`

**Layout / behavior:**

- `position: absolute; top/right: var(--space-sm)` on cover container; `pointer-events: none`.
- Neutral pill (`--bg-tertiary`, border) like `abandoned` status — readable on photos and placeholders.
- `Icon star` sm in `--warning` + avg `X.X` only; full stats in `title` / `aria-label`.
- Render independently of lang/chapters meta row.
- Not clickable; card/cover navigation unchanged.

**i18n:** `rating.avgAria` (avg + count).

**a11y:** Meaning in pill `aria-label`; star decorative via `Icon`.

**Anti-patterns:** Dim text without pill on cover photo; warning-filled pill background; showing `0.0` or count on pill; duplicating in meta row.

---

## `publication-rating-summary`

**When:** Publication page hero meta — display avg + allow rate CTA.

**When not:** Catalog cards; author self-rate CTA.

**Files:**

- [`src/client/components/Publication/PublicationRatingSummary.tsx`](../../../src/client/components/Publication/PublicationRatingSummary.tsx)
- [`src/client/pages/PublicationPage.tsx`](../../../src/client/pages/PublicationPage.tsx) — after tags, before actions

**Layout / behavior:**

- Row: 5 display stars (warning filled / dim empty) + avg + count.
- CTA chip styled like `.publication-page-toc-btn` opens `publication-rating-input` Modal.
- Guest → login; ineligible reader → disabled + hint; owner → no CTA.

**i18n:** `rating.summary`, `rating.rate`, `rating.change`, `rating.ownWork`, `rating.readFirst`.

**a11y:** Group labelled; CTA min 44px height on mobile.

**Anti-patterns:** Mixing rate UI into TOC/export actions without separation; emoji stars.

---

## `publication-rating-input`

**When:** Authenticated eligible user sets/changes 1–5 score.

**When not:** Guests; publication owner; users with no reading progress.

**Files:**

- [`src/client/components/Publication/RatePublicationModal.tsx`](../../../src/client/components/Publication/RatePublicationModal.tsx)
- Uses `Modal` + `Button` from `components/ui/`

**Layout / behavior:**

- Modal: title, 5 star buttons (44px), live label for selected score, Cancel / Save.
- Trigger from publication page CTA and optional one-shot reader nudge.
- One score per user×publication (upsert).

**i18n:** `rating.rateTitle`, `rating.scoreLabel1`…`5`, `rating.save`, `rating.remove` (optional).

**a11y:** `role="radiogroup"` / `aria-checked` per star; focus-visible; Escape closes Modal.

**Anti-patterns:** Inline form without Modal on publication page; rating without auth gate.

---

## `catalog-sort-by-rating`

**When:** Catalog needs “highest rated” ordering alongside date sort.

**When not:** As a 3-button segment (violates `filter-segment-control`); as `<Select>`.

**Files:**

- Extend [`CatalogFilterToolbar.tsx`](../../../src/client/components/Home/CatalogFilterToolbar.tsx) / `.css`
- [`catalogRoutes.ts`](../../../src/client/utils/catalogRoutes.ts) / [`HomePage.tsx`](../../../src/client/pages/HomePage.tsx) URL sync

**Layout / behavior:**

- Icon chip `star` toggles `sort=rating` (Bayesian desc).
- When active, date segment hidden or disabled.
- Publications below rating display threshold sort last.

**i18n:** `home.orderByRating`.

**a11y:** `aria-pressed` on chip.

**Anti-patterns:** Mixing Select into filter toolbar; sorting by raw avg without Bayesian/threshold.

---

## `admin-section-layout`

**When:** Admin panel page with create form, list, and edit modal (entities, news, publications, users).

**Compose:** `AdminLayout` → `admin-page` → intro → optional `AdminSegmentTabs` → `AdminFlash` → `AdminSection`(create) → `AdminSection`(list).

| Piece     | Component                            | Role                                                |
| --------- | ------------------------------------ | --------------------------------------------------- |
| Shell     | `AdminLayout`                        | Top tabs: entities, news, publications, users       |
| Sub-nav   | `AdminSegmentTabs`                   | Kind tabs inside entities (`/admin/entities/:kind`) |
| Feedback  | `AdminFlash`                         | Page-level error/success (not inside forms)         |
| Section   | `AdminSection`                       | Card with `h2`; `as="form"` for create              |
| List item | `admin-list-card` + `Button` actions | Text buttons, not icon-only                         |

**Files:**

- [`src/client/components/Admin/`](../../../src/client/components/Admin/) — `AdminSection`, `AdminFlash`, `AdminSegmentTabs`, `AdminPhotoUpload`, `admin-shared.css`
- [`src/client/pages/AdminNewsPage.tsx`](../../../src/client/pages/AdminNewsPage.tsx) — reference orchestration
- [`src/client/pages/AdminEntitiesPage.tsx`](../../../src/client/pages/AdminEntitiesPage.tsx) — kind tabs variant

**UX rules:**

- Create on page; edit in `Modal`; delete in `ConfirmModal`.
- Flash messages at page level only.
- List actions use `Button size="sm"` with visible labels.

**i18n:** `admin.*` namespace; per-kind keys under `admin.entities.*`.

**a11y:** `AdminSegmentTabs` uses `aria-current="page"`; segment tabs min-height 44px.

**Do not:** Mix entity kinds in one list; put success/error inside create form.

---

## `reading-history-card`

**When:** Profile or cabinet tab shows publications the user has read, with continue and reset actions.

**When not:** Catalog browse (use `PublicationCard` only); author dashboard project cards.

**Files:**

- [`src/client/components/Cabinet/ReadingHistorySection.tsx`](../../../src/client/components/Cabinet/ReadingHistorySection.tsx)
- [`src/client/components/Cabinet/ReadingHistorySection.css`](../../../src/client/components/Cabinet/ReadingHistorySection.css)
- Reuses [`PublicationCard.css`](../../../src/client/components/Home/PublicationCard.css) + [`home-grid`](../../../src/client/pages/HomePage.css)

**Layout:**

- `publication-card` shell; `publication-card-clickable` opens `/p/:id`
- `publication-card-read-btn` — Continue or Open (full-width primary CTA)
- `reading-history-reset-link` — secondary text link with `restart_alt` icon (not a second full-width button)
- `reading-history-meta` — `readCount / totalChapters` and optional last-read date

**Responsive:** `home-grid` breakpoints; reset link `min-height: 44px` on mobile.

**i18n:** `profile.continue`, `profile.open`, `profile.lastRead`, `readingProgress.reset`, `publication.chapters`.

**a11y:** Clickable area has `aria-label`; empty state uses `Icon` not emoji; reset opens confirm `Modal` with `Button` variants.

**Do not:** Style reset as unstyled native `<button>`; make entire card one click target (conflicts with CTA/reset).

---

## Entry template

```markdown
## `pattern-id`

**When:** …

**When not:** …

**Files:**

- `path/to/Component.tsx`
- `path/to/Component.css`

**Layout / behavior:** …

**Responsive:** …

**i18n:** keys …

**a11y:** aria-pressed, focus-visible, touch 44px …

**Anti-patterns:** …
```
