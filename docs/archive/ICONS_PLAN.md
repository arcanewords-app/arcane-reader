---
stale: true
status: archived
domain: meta
---

# Icon System Plan

## Goal

Move UI controls from mixed emoji to a consistent icon system based on Google Material Symbols.

## Approved Icon Source

- Primary: Google Material Symbols (Outlined) loaded in `index.html`.
- UI wrapper: `src/client/components/ui/Icon.tsx`.

## Migration Policy

- New or touched controls MUST use `Icon`.
- Control emoji are forbidden when a Material Symbol equivalent exists.
- Emoji are allowed only in decorative, non-interactive content blocks.
- For icon-only controls, provide accessible text via `title` and/or `aria-label`.

## Canonical Mapping (Action -> Icon)

- Navigation:
  - back: `arrow_back`
  - previous chapter: `chevron_left`
  - next chapter: `chevron_right`
  - close: `close`
  - overflow menu: `more_vert`
- Reader:
  - glossary: `menu_book`
  - table of contents: `toc`
  - share: `share`
  - settings: `settings`
  - copy: `content_copy`
  - find/search: `search`
- Translation workflow:
  - start translation: `translate`
  - analysis stage: `manage_search`
  - editing stage: `edit`
  - batch process: `auto_awesome`
  - mark translated: `check_circle`
  - mark all translated: `done_all`
  - skipped: `skip_next`
- Glossary and project actions:
  - glossary type character: `person`
  - glossary type location: `place`
  - glossary type term: `menu_book`
  - delete: `delete`
  - upload: `upload_file`
  - image: `image`
  - success: `check_circle`
  - warning: `warning`
  - error: `error`
  - pending/time: `schedule`

## Size Contract

- `sm` (18px): inline controls in compact buttons, status badges, filter chips.
- `md` (20px): default toolbar and standard button icons.
- `lg` (24px): emphasized icons in empty states or section headers.
- Keep icon size consistent inside a control family (same button row/modal footer/list action).

## Allowed Decorative Emoji

- Allowed only in non-interactive content where icon semantics are optional:
  - narrative/demo text content;
  - explicitly designed empty-state copy (if product requests it).
- Not allowed in:
  - buttons, links, tabs, toggles, menu items;
  - modal titles for action flows;
  - filter/sort controls, status badges, stage controls.

## Color Contract (Status States)

Icons are neutral by default. Apply color only for significant status states via semantic tokens:

| Situation | Token | Use case |
|-----------|-------|----------|
| default/neutral | `--text-secondary` | Generic controls, inactive filters |
| active/focused | `--accent` | Selected filter, active tab, focused context |
| success/completed | `--success` | Chapter done, upload success, mark translated |
| warning/limit-soon | `--warning` | Token limit approaching, has untranslated chapters |
| error/failed | `--error` | Chapter error, upload failed, batch error |
| disabled | `--text-dim` | Disabled controls (plus reduced opacity) |

Apply color via container class or modifier (e.g. `.is-success`, `.is-error`), not inline styles. New status icons MUST use a semantic class; PR review rejects ad-hoc icon colors.

## Review Rule

- Any new control icon in `src/client/**` MUST use `Icon`.
- PR review should reject new emoji-based control icons unless explicitly justified as decorative-only.

## Suggested Mapping (legacy emoji -> icon)

- `в†ђ` -> `arrow_back`
- `рџ“–`/`рџ“љ` -> `menu_book`
- `рџ“‘` -> `toc`
- `рџ”—` -> `share`
- `вљ™пёЏ` -> `settings`
- `рџ“‹` -> `content_copy`
- `рџ”Ќ` -> `manage_search`
- `рџ”®` -> `translate`
- `вњЁ` -> `auto_awesome` or `edit` (context-based)
- `вњ…` -> `done` / `done_all`
- `вќЊ` -> `error`
- `рџ—‘пёЏ` -> `delete`
- `рџ“¤` -> `upload_file`
- `рџ–јпёЏ` -> `image`
- `вЏі` -> `schedule`
- `вљ пёЏ` -> `warning`
- `вЏ­` -> `skip_next`

## Rollout Steps

1. Foundation (done):
   - Add Material Symbols font link in `index.html`.
   - Add `Icon` primitive in `src/client/components/ui/`.
2. Priority screens:
   - `ReadingMode`, `PublicationPage`, `ChapterHeader`, `ChapterList`, `ProcessChapters`.
3. Broader migration:
   - `GlossaryModal`, `ProjectInfo`, `ProjectsPage`, `ProfilePage`.
4. Cleanup (done for current client scope):
   - Remove remaining control emoji in touched modules.
   - Keep decorative emoji only in approved non-interactive contexts.
