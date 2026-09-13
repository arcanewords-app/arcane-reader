# E2E / system tests (Wave 10 — local stamp)

Playwright against the **local Docker stamp**, not prod/staging. Not in pre-push or CI.

## Preconditions

```bash
npm run stack:up            # restores arcane-reader-stamp:latest if present
npm run stack:restore       # optional: clean stamp between dirty E2E runs
npm run dev                 # UI :5173, API :3000
npx playwright install chromium   # once per machine
npm run test:e2e            # logic smoke (no @llm, no @visual)
npm run test:e2e:visual     # pixel shells
npm run test:e2e:llm        # smoke + tiny live translate (needs OPENAI_API_KEY in .env.local)
```

First time (no stamp image): `STACK_STAMP=0 npm run stack:up` then `stack:load` then `stack:stamp`. Empty catalog, failed seed login, or Author without projects → abort with `run npm run stack:up` (or `stack:restore` / `stack:load`).

## Personas (stamp seed)

Password for all: `local-dev-password`

- **Guest** — no session
- **Reader** — `user@local.test` / `user` — catalog only, **0 projects**
- **Author** — `author@local.test` / `author` — owns remapped dump projects
- **AuthorPlus** — `author-plus@local.test` / `author_plus` — empty workspace
- **Admin** — `admin@local.test` / `admin`

Catalog is public: Reader **sees** all books; that is not ownership. If Reader has `/projects` data, the stamp is dirty.

Do not hardcode publication UUIDs from the dump. User UUIDs in `actors/personas.ts` match `supabase/seed.sql`.

## Layout (Persona / Actor)

- `actors/` — personas + Actor (`attemptsTo` / `see`)
- `targets/` — named locators (only place for `getByRole` / `getByTestId`)
- `tasks/` — user verbs
- `questions/` — assertions (`layoutMatches` only in `*.visual.spec.ts`)
- `viewports.ts` — phone / tablet / desktop CSS sizes (product breakpoints)
- `fixtures/test.ts` — `test.extend({ guest, reader, author, authorPlus, admin })`
- `specs/` — `persona.does-thing.spec.ts` (logic) and `persona.visual.spec.ts` (`@visual`)

Gherkin later can wrap the same tasks. Cucumber is not installed.

## Selectors

Locale in fixtures is `en`. Tasks, questions, and specs **must** import locators from `targets/` — no CSS classes, no `getByTitle` as the primary hook, no regex on dump book titles.

1. Unique accessible name — `getByRole` / `getByLabel` / `getByPlaceholder` (Log in, Sign in, My projects, New project).
2. `data-testid` — lists, icon-only controls, duplicate copy.

| `data-testid`                | Where                                                      |
| ---------------------------- | ---------------------------------------------------------- |
| `publication-card`           | Catalog card clickable                                     |
| `publication-read-chapter`   | Publication page chapter **Read** (not the Read filter)    |
| `project-card`               | Author workspace card                                      |
| `chapter-item`               | Sidebar chapter row                                        |
| `chapter-reading-mode`       | Chapter header reading-mode button                         |
| `reading-mode-text`          | Publication/author reading body (wait for first paragraph) |
| `chapter-actions`            | Chapter overflow menu trigger                              |
| `project-search-find`        | Find-in-project query field                                |
| `token-usage`                | Header credit indicator                                    |
| `settings-model-translation` | Project settings translation model `<select>`              |

New production `data-testid` needs a row here **and** a helper in `targets/`.

## Isolation

Reload the stamp (`npm run stack:restore`, or `stack:load` if there is no stamp image) before a clean run. Tests may add a tiny chapter or Reader progress; they must not delete or unpublish dump rows. `authorPlus.visual.spec.ts` / `seesEmptyAuthorWorkspace` fail if AuthorPlus already created a project.

## Visual shells

Separate `*.visual.spec.ts` tagged `@visual` — not mixed into logic specs. The fixture seeds `arcane:dismissed-alerts:v1` (all stamp alert ids from `GET /api/admin/announcements`) so a banner cannot shift the layout.

`fullPage` `toHaveScreenshot` via `layoutMatches(name)`. Stamp catalog/projects are **in** the PNG. Mask only `token-usage` and `.project-card-date`. One Chromium project; the question resizes to phone (390×844), tablet (**834×1112**, inside 768–1023), desktop (1280×720) and restores the original viewport.

```bash
npm run test:e2e:visual
npm run test:e2e:update-snapshots   # @visual only; after layout, dump, or breakpoint tweak
```

| Prefix                                                                                                                           | Spec                                                |
| -------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------- |
| `guest-catalog` / `guest-sign-in` / `guest-account-tiers` / `guest-publication` / `guest-reading` / `guest-news` / `guest-about` | `guest.visual.spec.ts`                              |
| `reader-upgrade` / `reader-profile`                                                                                              | `reader.visual.spec.ts`                             |
| `author-projects` / `author-project` / `author-chapter` / `author-reading` / `author-requests`                                   | `author.visual.spec.ts`                             |
| `authorplus-empty`                                                                                                               | `authorPlus.visual.spec.ts` (needs `stack:restore`) |
| `admin-users`                                                                                                                    | `admin.visual.spec.ts`                              |

Files: `{prefix}-{phone|tablet|desktop}.png` next to that visual spec. Local Chromium + OS/DPI — not a CI gate. Do not add a Playwright project per viewport. New reader screens need a shell (see `.cursor/skills/ui/RESPONSIVE.md`). Do **not** add `/news/:slug`, contact/legal, or extra `/admin/*` shells unless those screens are being changed.

## Policy

- Chromium only
- Live OpenAI only in `@llm`
- Testing utility owns this layer; not a pre-push gate
