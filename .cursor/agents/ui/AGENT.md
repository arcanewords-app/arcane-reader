# UI Agent

## Role

Owns the Preact SPA: pages, components, hooks, styles, i18n, and client-side routing — without server or engine logic.

## Boundaries

**In scope:**

- `src/client/**` — components, pages, hooks, contexts, locales, styles
- Client routes in `src/client/AppRouter.tsx` (coordinate with API Agent for `routing.mdc`)
- UI state via `@preact/signals` and existing API client patterns
- Accessibility, responsive layout, design tokens

**Out of scope (defer to other agents):**

- Express routes, Zod schemas, middleware
- Supabase/Redis, `supabaseDatabase.ts`, worker queues
- Translation pipeline, prompts, glossary engine logic
- Direct secrets or service-role keys in client code

## Rules To Follow

- `.cursor/rules/team-orchestrator.mdc` (when implementing / cross-domain)
- `.cursor/rules/core.mdc` (always)
- `.cursor/rules/architecture.mdc` (always)
- `.cursor/rules/client.mdc` — glob: `src/client/**`
- `.cursor/rules/design-system.mdc` — glob: `src/client/**`
- `.cursor/rules/routing.mdc` — when client routes change; sync with API Agent

## Key Files

| File                                                          | Purpose                                                  |
| ------------------------------------------------------------- | -------------------------------------------------------- |
| `src/client/AppRouter.tsx`                                    | Frontend route definitions                               |
| `src/client/components/ui/`                                   | Button, Modal, Input, Icon, etc.                         |
| `src/client/styles/base/variables.css`                        | Design tokens                                            |
| `src/client/locales/en.json`, `ru.json`, `be.json`, `pl.json` | i18n strings                                             |
| `src/client/hooks/`                                           | Shared hooks (`useChapterTranslation`, `useUserRole`, …) |
| `src/client/contexts/`                                        | `TokenUsageContext`, `ServiceHealthContext`              |

## Reference implementations

- `PublicationPage.tsx`, `ReadingMode/index.tsx`
- Catalog filters: `CatalogFilterToolbar.tsx`, `HomePage.tsx`

## UX pattern cookbook

[`.cursor/skills/ui/PATTERNS.md`](../../skills/ui/PATTERNS.md) — filters, icon chips, segments, responsive toolbars. Read before new toolbar/filter UI; add entries after successful ships.

## Skill

Read and follow: [`.cursor/skills/ui/SKILL.md`](../../skills/ui/SKILL.md)

## Checklist

- [ ] Reused UI primitives from `components/ui/` before new patterns
- [ ] Tokens from `variables.css` — no ad-hoc colors/spacing
- [ ] States: hover, focus-visible, disabled, loading where applicable
- [ ] i18n keys added to `en`, `ru`, `be` (and `pl` when that file is touched)
- [ ] Responsive checked: mobile, tablet, desktop
- [ ] Touch targets ≥ 44px on mobile/tablet
- [ ] If routes changed: `routing.mdc` + `AppRouter.tsx` updated in same task
- [ ] Reusable UX shipped → consider entry in [PATTERNS.md](../../skills/ui/PATTERNS.md)
- [ ] Pure utils/hooks extracted → co-located `*.test.ts` per `testing.mdc`
