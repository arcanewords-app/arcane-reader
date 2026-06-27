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

| Id                       | Summary                                        | Reference                            |
| ------------------------ | ---------------------------------------------- | ------------------------------------ |
| `catalog-filter-toolbar` | Icon chips: language, complete, sort segment   | `CatalogFilterToolbar.tsx`           |
| `filter-icon-chip`       | 44px square chip, icon or short code           | `CatalogFilterToolbar.css`           |
| `filter-segment-control` | Connected toggle pair (sort direction)         | `CatalogFilterToolbar.css`           |
| `responsive-filter-bar`  | Search + toolbar: 2 rows mobile, 1 row tablet+ | `HomePage.css`                       |
| `entity-filter-chips`    | Removable URL-driven filter tags               | `HomePage.tsx` / `.home-entity-chip` |
| `header-locale-control`  | App language: icon + code + dropdown           | `Header.tsx`                         |
| `header-support-control` | Support BMC/Boosty: icon + label + dropdown    | `Header/SupportMenu.tsx`             |
| `cover-status-badge`     | Absolute badge on publication cover            | `PublicationStatusBadge.tsx`         |
| `admin-section-layout`   | Admin CRUD: intro, flash, sections, sub-tabs   | `components/Admin/`                  |

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

**When:** Project accepts tips via external platforms (Buy Me a Coffee, Boosty). At least one `VITE_SUPPORT_*_URL` must be set.

**When not:** No env URLs configured (control hidden). Reading mode chrome (use global header only in v1).

**Files:**

- [`src/client/components/Header/SupportMenu.tsx`](../../../src/client/components/Header/SupportMenu.tsx)
- [`src/client/constants/supportLinks.ts`](../../../src/client/constants/supportLinks.ts)
- `.header-support-*` in [`Header.css`](../../../src/client/components/Header.css)

**Behavior:**

| URLs configured | UI                                                                           |
| --------------- | ---------------------------------------------------------------------------- |
| 0               | Hidden                                                                       |
| 1               | Icon + label button → direct `window.open`                                   |
| 2               | Dropdown; locale orders primary (`ru`/`be` → Boosty first, `en` → BMC first) |

**Specs:** `Icon local_cafe` + label; mobile icon-only 44px; warm hover on `.header-support-btn` (warning tint, not primary/orange BMC widget). Dropdown items: title, hint, optional «Recommended» on first row, `open_in_new`.

**Env:** `VITE_SUPPORT_BMC_URL`, `VITE_SUPPORT_BOOSTY_URL` (https only). See `env.example.txt`.

**i18n:** `support.*` in `en.json`, `ru.json`, `be.json`.

**a11y:** `aria-expanded`, `aria-haspopup`, `role="menu"` / `menuitem`, external link `rel="noopener noreferrer"`.

**Analytics:** `support_click` GA event with `{ platform: 'bmc' | 'boosty' }` when cookies accepted.

**Do not:** Bury support only in Info menu; use BMC brand colors; add a third platform without redesigning the dropdown.

---

## `cover-status-badge`

**When:** Translator-set status on publication cover in catalog and publication page.

**Specs:**

- `position: absolute` on cover container; `pointer-events: none`
- `complete` → `--success`; keep badge set minimal for catalog clarity (prefer only `complete` visible when product is binary)

**Reference:** [`PublicationStatusBadge.tsx`](../../../src/client/components/Home/PublicationStatusBadge.tsx).

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
