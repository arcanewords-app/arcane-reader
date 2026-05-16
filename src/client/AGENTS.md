# Client — nested agent context

Applies when editing `src/client/**`. Global rules: `.cursor/rules/client.mdc`, `.cursor/rules/design-system.mdc`, profile [`.cursor/agents/ui/AGENT.md`](../../.cursor/agents/ui/AGENT.md), skill [`.cursor/skills/ui/SKILL.md`](../../.cursor/skills/ui/SKILL.md).

## Stack

- Preact (`class`, not `className`), Vite, `preact-router`, `react-i18next`, `@preact/signals`
- API via shared client/hooks — never service-role keys in the browser

## UI patterns

- Primitives: `src/client/components/ui/` (Button, Modal, Input, Icon, …)
- Tokens: `src/client/styles/base/variables.css` — no ad-hoc colors
- Icons: `Icon.tsx` + Material Symbols (`design-system.mdc`)
- i18n: `useTranslation()`; update `locales/en.json`, `ru.json`, `pl.json`

## Routes

- Client routes: `src/client/AppRouter.tsx`
- Any route change: sync [`.cursor/rules/routing.mdc`](../../.cursor/rules/routing.mdc) in the same task

## Reference implementations

- `PublicationPage.tsx`, `ReadingMode/index.tsx`
