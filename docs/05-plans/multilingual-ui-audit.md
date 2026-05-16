---
type: plan
status: active
domain: client
stale: false
created: 2026-05-16
updated: 2026-05-16
canonical: .cursor/rules/client.mdc
source_archive: ../archive/MULTILINGUAL_PLAN.md
---

# Multilingual UI audit

## Goal

UI strings in ru/en/pl via i18next; no user-facing hardcoded literals in touched client code.

## Already implemented

- Locales: `src/client/locales/{en,ru,pl}.json`
- `APP_LOCALE_KEY` + `setSavedLocale` in `src/client/i18n.ts`
- Header locale dropdown (`ru` / `en` / `pl`)

## Open tasks

- [ ] Grep `src/client/` for hardcoded Cyrillic/Latin UI strings outside i18n
- [ ] Ensure new keys added to all three locale files (per `client.mdc`)
- [ ] Profile/settings: confirm locale preference persistence matches plan (localStorage vs server)

## Out of scope

- Translating chapter/glossary content (translation pipeline only)

## References

- `../archive/MULTILINGUAL_PLAN.md`
