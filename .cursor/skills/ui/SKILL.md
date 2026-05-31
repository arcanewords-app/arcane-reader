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

## Domain Knowledge

- **Stack:** Preact (not React), Vite, `preact-router`, `react-i18next`, `@preact/signals`
- **Class names:** use `class`, not `className`
- **CSS:** co-locate `Component.css` with component; tokens from `src/client/styles/base/variables.css`
- **Icons:** `Icon.tsx` + Material Symbols — see `design-system.mdc` for canonical names
- **API:** use shared API client / hooks — never embed service keys

## Patterns

- Compose from `src/client/components/ui/` (Button, Modal, Input, Badge, Icon)
- `useTranslation()` for all user-visible strings; update `en` and `ru` only (app locales)
- Project translation pair: source `en|ko|zh`, target `ru` — labels via `language.*` i18n keys
- Gates: `AuthorGate`, `AdminGate` for protected areas
- Service banner: client reacts to **503** via `ServiceHealthContext`
- Signals/stores: prefer existing patterns in hooks before new global state

## Anti-patterns

- Hardcoded UI strings in components
- Ad-hoc `#hex` colors when tokens exist
- Emoji as control icons (use Material Symbols)
- Inline styles for reusable visual patterns
- Calling Supabase or Redis from the browser with service role
- `className` (React-ism) in new code

## Planned extensions

_Add sub-skills here as they grow: preact-signals, chapter-editor UX, reading-mode layout._
