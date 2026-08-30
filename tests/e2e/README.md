# E2E / system tests (Wave 10 — local stamp)

Playwright against the **local Docker stamp**, not prod/staging. Not in pre-push or CI.

## Preconditions

```bash
npm run stack:up
npm run stack:load          # seed personas + dump; remaps owners to author@local.test
npm run dev                 # UI :5173, API :3000
npx playwright install chromium   # once per machine
npm run test:e2e            # smoke (no live OpenAI)
npm run test:e2e:llm        # smoke + tiny live translate (needs OPENAI_API_KEY in .env.local)
```

Empty catalog, failed seed login, or Author without projects → abort with `run npm run stack:load`.

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
- `questions/` — assertions
- `fixtures/test.ts` — `test.extend({ guest, reader, author, authorPlus, admin })`
- `specs/` — `persona.does-thing.spec.ts`

Gherkin later can wrap the same tasks. Cucumber is not installed.

## Selectors

Locale in fixtures is `en`. Tasks, questions, and specs **must** import locators from `targets/` — no CSS classes, no `getByTitle` as the primary hook, no regex on dump book titles.

1. Unique accessible name — `getByRole` / `getByLabel` / `getByPlaceholder` (Log in, Sign in, My projects, New project).
2. `data-testid` — lists, icon-only controls, duplicate copy.

| `data-testid`                | Where                                                   |
| ---------------------------- | ------------------------------------------------------- |
| `publication-card`           | Catalog card clickable                                  |
| `publication-read-chapter`   | Publication page chapter **Read** (not the Read filter) |
| `project-card`               | Author workspace card                                   |
| `chapter-item`               | Sidebar chapter row                                     |
| `chapter-reading-mode`       | Chapter header reading-mode button                      |
| `chapter-actions`            | Chapter overflow menu trigger                           |
| `project-search-find`        | Find-in-project query field                             |
| `token-usage`                | Header credit indicator                                 |
| `settings-model-translation` | Project settings translation model `<select>`           |

New production `data-testid` needs a row here **and** a helper in `targets/`.

## Isolation

Reload the stamp (`stack:load`) before a clean run. Tests may add a tiny chapter or Reader progress; they must not delete or unpublish dump rows.

## Policy

- Chromium only
- Live OpenAI only in `@llm`
- Testing utility owns this layer; not a pre-push gate
