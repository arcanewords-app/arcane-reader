# supabaseDatabase decomposition — status

**Plan:** `.cursor/plans/supabasedatabase_decomposition_f8b61168.plan.md` (do not edit plan file from agents).

## Architecture (completed)

```
src/services/supabaseDatabase.ts     # thin facade (~20 lines), backward-compat re-exports
src/services/supabase/
  transforms/   publication, news, catalog, glossary (+ supabaseTransforms.ts at services/)
  pure/         cloneErrors, glossaryCopy, chapterSync, announcements
  db/           clientContext, postgrestErrors, pagination
  loaders.ts    internal chapter/paragraph/glossary loaders
  domains/      projects, chapters, glossary, paragraphs, publications,
                readerProgress, translationReports, news, admin, catalogBoard
tests/integration/supabase/README.md   # Q4 live suite placeholder (blocked)
```

## Phase checklist

| Phase                 | Status  | Notes                                                                                 |
| --------------------- | ------- | ------------------------------------------------------------------------------------- |
| 1 — transforms        | Done    | publication, news, catalog, glossary ToDB; list item transforms in supabaseTransforms |
| 2 — pure              | Done    | cloneErrors, glossaryCopy unify, chapterSync, announcements                           |
| 3 — db infra          | Done    | clientContext, postgrestErrors, pagination                                            |
| 4 — domain split      | Done    | 10 domain modules + loaders; facade re-exports                                        |
| 5 — mock domain tests | Done    | paragraphs search, chapters import, news announcements, + transform/pure tests        |
| 6 — Q4 integration    | Blocked | `tests/integration/supabase/README.md`                                                |

## Importers

No changes required: all 16 consumers still import from `supabaseDatabase.ts`.

## Dependency rules (no cycles)

```
loaders.ts          ← chapters, projects, publications (data loading only)
domains/glossary    ← CRUD only; no imports from publications
domains/publications ← getGlossaryForPublication orchestrates pub + loaders
```

`check:circular` must pass before commit (`npm run check:circular`).

## routes/client split (completed 2026-07-12)

| Track | Deliverables                                                                                                                                         |
| ----- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| **A** | `api/chapters/helpers/*` (stages, token limit, import pipeline, mark translated, job polling) + `chapterReports.ts`; domain imports in `chapters.ts` |
| **B** | `client/api/errors`, `cache/*`, `transport/*`, `domains/*`; thin `client.ts` facade                                                                  |

## Next (post routes/client split)

- Optional `chapterImport.ts` — extract async job + sync POST handlers (~600 lines)
- Q4: live Supabase integration when test env exists
