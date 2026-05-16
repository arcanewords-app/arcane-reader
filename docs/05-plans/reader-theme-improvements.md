---
type: plan
status: active
domain: client
stale: false
created: 2026-05-16
updated: 2026-05-16
canonical: .cursor/rules/design-system.mdc
source_archive: ../archive/READER_THEME_IMPROVEMENT_PLAN.md
---

# Reader theme improvements

## Goal

Readable, consistent reader themes (contrast, tokens) for project and publication reading modes.

## Scope

- `src/client/components/ReadingMode/`
- `src/client/styles/base/variables.css` (`[data-reader-theme]`)
- `ReaderSettings` component

## Open tasks

- [ ] Audit WCAG contrast for all `data-reader-theme` presets
- [ ] Align publication reading placeholders with reader token set (optional)
- [ ] Unify default theme for publication path vs project `settings.reader`

## Notes

- Single `ReadingMode` component used on project and publication routes (see archive plan section "two entry points").

## References

- `../archive/READER_THEME_IMPROVEMENT_PLAN.md`
