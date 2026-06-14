---
type: plan
status: active
domain: client
stale: false
created: 2026-05-16
updated: 2026-06-14
canonical: .cursor/rules/client.mdc
source_archive: ../archive/MULTILINGUAL_PLAN.md
---

# Multilingual UI audit

## Goal

UI strings in ru/en via i18next; no user-facing hardcoded literals in touched client code.

## Already implemented

- Locales: `src/client/locales/{en,ru}.json` (active); `pl.json` legacy/unused in runtime
- `APP_LOCALE_KEY` + `setSavedLocale` in `src/client/i18n.ts`
- Header locale dropdown (`ru` / `en`)
- App locale resolution (2026-06-14): **ru** default + browser detection on first visit; order: localStorage → `navigator.languages` → ru; `document.documentElement.lang` synced on init and switch

## Open tasks

- [ ] Grep `src/client/` for hardcoded Cyrillic/Latin UI strings outside i18n
- [ ] Ensure new keys added to **en** and **ru** locale files (per `client.mdc`)

## Out of scope

- Translating chapter/glossary content (translation pipeline only)
- Server-side `ui_locale` in profiles (cross-device sync) — deferred
- SSR `Accept-Language` cookie — deferred

## References

- `../archive/MULTILINGUAL_PLAN.md`
