# Client — nested agent context

Applies when editing `src/client/**`. Global rules: `.cursor/rules/client.mdc`, `.cursor/rules/design-system.mdc`, profile [`.cursor/agents/ui/AGENT.md`](../../.cursor/agents/ui/AGENT.md), skill [`.cursor/skills/ui/SKILL.md`](../../.cursor/skills/ui/SKILL.md).

## Stack

- Preact (`class`, not `className`), Vite, `preact-router`, `react-i18next`, `@preact/signals`
- API via shared client/hooks — never service-role keys in the browser

## UI patterns

- Primitives: `src/client/components/ui/` (Button, Modal, Input, Icon, …)
- Tokens: `src/client/styles/base/variables.css` — no ad-hoc colors
- Icons: `Icon.tsx` + Material Symbols (`design-system.mdc`)
- i18n: `useTranslation()`; app locales **en** and **ru** only (`src/client/i18n.ts`)
- Project translation pair UI: source en|ko|zh (+ ru if target be) → target ru|be (default en→ru)
- Default pair: `SettingsModal` → `PUT /api/projects/:id/languages` (locked server-side after glossary / non-pending chapters)
- Ephemeral override: `ProcessChapters` + `TranslationPanel` → optional `languagePair` in translate/batch API bodies
- `ProjectLanguagePairFields`: use `idPrefix` when multiple instances on one page

## Routes

- Client routes: `src/client/AppRouter.tsx`
- Any route change: sync [`.cursor/rules/routing.mdc`](../../.cursor/rules/routing.mdc) in the same task

## Reference implementations

- `PublicationPage.tsx`, `ReadingMode/index.tsx`
