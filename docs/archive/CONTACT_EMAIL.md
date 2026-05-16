---
stale: true
status: archived
domain: meta
---

# Contact Email

The project contact email is centralized in a single constant for easy updates (e.g. when switching to a project email).

## Location

**Source:** [src/shared/contact.ts](../src/shared/contact.ts)

```ts
export const CONTACT_EMAIL = 'ilya.murashka.w@gmail.com';
```

## Usage

The constant is used in:

| Component / Page                                                 | Usage                                                                                      |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| [ContactPage](../src/client/pages/ContactPage.tsx)               | `mailto:` link                                                                             |
| [PrivacyPage](../src/client/pages/PrivacyPage.tsx)               | Interpolation in `privacy.controllerDesc`, `privacy.yourRightsDesc`, `privacy.contactDesc` |
| [TermsPage](../src/client/pages/TermsPage.tsx)                   | Interpolation in `terms.contactDesc`                                                       |
| [UpgradeScreen](../src/client/components/Auth/UpgradeScreen.tsx) | `mailto:` for "Request upgrade" button                                                     |
| [ProfilePage](../src/client/pages/ProfilePage.tsx)               | `mailto:` for "Upgrade level" button                                                       |

## Changing the Email

1. Edit `src/shared/contact.ts` and update the `CONTACT_EMAIL` value.
2. Rebuild the application (`npm run build`).

No other changes are required вЂ” all usages reference this constant.
