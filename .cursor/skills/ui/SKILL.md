---
name: ui-agent
description: Preact UI patterns for Arcane Reader — components, tokens, i18n, routing. Use when acting as UI Agent or editing src/client/**.
---

# UI Agent Skill

## When To Use

- Editing or adding anything under `src/client/**`
- New pages, modals, forms, reading/editor UI
- Styling, responsive layout, accessibility fixes
- Adding or changing client routes (with `AppRouter.tsx` + `routing.mdc`)
- **Tabs, filters, in-app navigation** — read `@.cursor/rules/spa-navigation.mdc` and `@docs/02-how-to/sync-url-with-ui-state.md`
- **Filters, toolbars, chips, badges** — read [PATTERNS.md](./PATTERNS.md) first

## Domain Knowledge

- **Stack:** Preact (not React), Vite, `preact-router`, `react-i18next`, `@preact/signals`
- **Class names:** use `class`, not `className`
- **CSS:** co-locate `Component.css` with component; tokens from `src/client/styles/base/variables.css`
- **Icons:** `Icon.tsx` + Material Symbols — see `design-system.mdc` and `ICON_NAMES.md`
- **API:** use shared API client / hooks — never embed service keys

## UX/UI pattern cookbook

**[PATTERNS.md](./PATTERNS.md)** — proven recipes (catalog filter chips, segment controls, responsive filter bar, entity chips, cover badges).

Workflow:

1. **Before** new filter/toolbar UI → check index in PATTERNS.md; reuse or extend existing components.
2. **After** a shipped UX the team likes → add a short entry to PATTERNS.md (same task or follow-up PR).

Policies (tokens, a11y, 44px touch) stay in [`design-system.mdc`](../../rules/design-system.mdc). PATTERNS.md is for **feature-level composition**, not duplicate rules.

## Patterns

- Compose from `src/client/components/ui/` (Button, Modal, Input, Badge, Icon)
- Feature toolbars: prefer dedicated components (e.g. `CatalogFilterToolbar`) over inline JSX in pages
- `useTranslation()` for all user-visible strings; app locales **en**, **ru**, **be**, **pl** (`SUPPORTED_LOCALES` in `src/client/i18n.ts`)
- Project translation pair: source `en|ko|zh` (+ `ru` if target `be`), target `ru|be` — labels via `language.*` i18n keys
- Gates: `AuthorGate`, `AdminGate` for protected areas
- Service banner: client reacts to **503** via `ServiceHealthContext`
- Signals/stores: prefer existing patterns in hooks before new global state

## Reference implementations

| Area                   | Files                                          |
| ---------------------- | ---------------------------------------------- |
| Publication / reader   | `PublicationPage.tsx`, `ReadingMode/index.tsx` |
| Catalog filters        | `CatalogFilterToolbar.tsx`, `HomePage.tsx`     |
| App locale             | `Header.tsx`                                   |
| Dashboard type filters | `Dashboard.css` — `dashboard-filter-btn`       |

## Anti-patterns

- Hardcoded UI strings in components
- Ad-hoc `#hex` colors when tokens exist
- Emoji as control icons (use Material Symbols)
- Inline styles for reusable visual patterns
- Mixed control types in one toolbar (Select + text buttons + icon chips)
- Calling Supabase or Redis from the browser with service role
- `className` (React-ism) in new code

## Checklist (UI tasks)

- [ ] Checked [PATTERNS.md](./PATTERNS.md) for reusable recipe (publication ratings → `publication-rating-*`, `catalog-sort-by-rating`)
- [ ] Primitives from `components/ui/`; tokens from `variables.css`
- [ ] hover / focus-visible / disabled / loading where applicable
- [ ] i18n keys in en, ru, be (and pl if touching pl.json)
- [ ] Mobile → tablet → desktop; touch ≥ 44px
- [ ] New reusable UX → entry in PATTERNS.md
