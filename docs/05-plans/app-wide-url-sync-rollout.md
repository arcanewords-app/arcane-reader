---
type: plan
status: active
domain: client
canonical: .cursor/rules/spa-navigation.mdc
stale: false
created: 2026-07-11
updated: 2026-07-11
---

# App-wide URL sync rollout

Phased plan to apply [[_canonical/rules/spa-navigation]] across the Preact SPA. Reference implementation: reading mode (shipped).

## Phases

```mermaid
flowchart TD
  phase0 [Phase 0: Docs + rule] --> phase1 [Phase 1: High-value public]
  phase1 --> phase2 [Phase 2: Author workspace]
  phase2 --> phase3 [Phase 3: Optional refinements]

  phase0 --> readingDone [Reading mode - DONE]
  phase1 --> profile [Profile tabs - DONE]
  phase1 --> pubFilters [Publication page filters - DONE]
  phase2 --> projectSearch [Project search deep link]
  phase3 --> paragraphGuest ["Guest ?paragraph= reader"]
```

---

## Phase 0 — Documentation (DONE)

| Item                                    | Status                                          |
| --------------------------------------- | ----------------------------------------------- |
| `.cursor/rules/spa-navigation.mdc`      | Done                                            |
| [[03-explanation/addressable-ui-state]] | Done                                            |
| [[02-how-to/sync-url-with-ui-state]]    | Done                                            |
| Reading mode URL sync in code           | Done — `readingRoutes.ts`, `ReadingMode`, pages |

---

## Phase 1 — High-value public surfaces (DONE)

Shipped 2026-07-11: `profileRoutes.ts`, `publicationRoutes.ts`, `ProfilePage`, `PublicationPage`, `routing.mdc` query contracts.

### 1.1 Profile tabs (DONE)

|                |                                                                      |
| -------------- | -------------------------------------------------------------------- |
| **URL**        | `/profile?tab=reading` (default, omitted) \| `settings` \| `profile` |
| **Files**      | `src/client/utils/profileRoutes.ts`, `ProfilePage.tsx`               |
| **Acceptance** | F5 on Settings tab; Back from account-tiers returns to pushed tab    |

### 1.2 Publication page chapter filters (DONE)

|                |                                                                |
| -------------- | -------------------------------------------------------------- |
| **URL**        | `/p/:id?q=…&translation=…&read=…&order=…` (defaults omitted)   |
| **Files**      | `src/client/utils/publicationRoutes.ts`, `PublicationPage.tsx` |
| **Acceptance** | Shareable filtered chapter list; guest `read` query stripped   |

---

## Phase 1 — original spec (archived detail)

### 1.1 Profile tabs

|                  |                                                                                         |
| ---------------- | --------------------------------------------------------------------------------------- |
| **Problem**      | `activeTab` in `ProfilePage.tsx` is local state; reload always shows default tab        |
| **Proposed URL** | `/profile?tab=history` \| `settings` \| `account` (or `/profile/:tab` if we add routes) |
| **Files**        | `ProfilePage.tsx`, `routing.mdc`, `AppRouter.tsx` if new path                           |
| **Risk**         | Low — single page, few tabs                                                             |
| **Acceptance**   | F5 on History tab stays on History; Back from account-tiers returns to correct tab      |

### 1.2 Publication page chapter filters

|                  |                                                                                                           |
| ---------------- | --------------------------------------------------------------------------------------------------------- |
| **Problem**      | `chapterSearch`, `translationFilter`, `chapterFilter`, `chapterOrder` in `PublicationPage.tsx` not in URL |
| **Proposed URL** | `/p/:id?q=…&translation=translated\|all\|untranslated&read=all\|unread\|read&order=asc\|desc`             |
| **Files**        | `PublicationPage.tsx`, `routing.mdc` (query contract only)                                                |
| **Risk**         | Medium — many query keys; keep defaults out of URL                                                        |
| **Acceptance**   | Shared link opens publication with same chapter list filters                                              |

---

## Phase 2 — Author workspace

### 2.1 Project search modal deep link

|                  |                                                                             |
| ---------------- | --------------------------------------------------------------------------- |
| **Problem**      | `ProjectSearchModal` state not linkable from notifications or glossary      |
| **Proposed URL** | `/projects/:id?search=…` or open editor with existing `ChapterPage?search=` |
| **Files**        | `ProjectPage.tsx`, `ProjectSearchModal.tsx`, `ChapterPage.tsx`              |
| **Risk**         | Low — `ChapterPage` already supports `?search=`                             |
| **Acceptance**   | Link from project search result opens chapter with find pre-filled          |

---

## Phase 3 — Optional refinements

### 3.1 Guest reader paragraph in URL

|                  |                                                                   |
| ---------------- | ----------------------------------------------------------------- |
| **Problem**      | Guests lose scroll position on F5 mid-chapter                     |
| **Proposed URL** | `/p/:pub/chapters/:id/reading?paragraph=N` (mirror `ChapterPage`) |
| **Files**        | `ReadingMode`, `PublicationReadingPage`, `routing.mdc`            |
| **Risk**         | Low — optional query; omit when N=0                               |
| **Acceptance**   | F5 mid-chapter scrolls to same paragraph for guests               |

### 3.2 Shared `useUrlSync` hook (client)

|                |                                                                                                             |
| -------------- | ----------------------------------------------------------------------------------------------------------- |
| **Problem**    | Duplicated `URLSearchParams` + `popstate` boilerplate                                                       |
| **Proposed**   | Extract pattern from `HomePage.tsx` + `debug-app/hooks/useUrlSync.ts` into `src/client/hooks/useUrlSync.ts` |
| **Risk**       | Medium — adopt after 2–3 more screens use query sync                                                        |
| **Acceptance** | Profile + catalog use shared hook; tests for parse/serialize round-trip                                     |

### 3.3 Playwright E2E

|           |                                                           |
| --------- | --------------------------------------------------------- |
| **Scope** | `reading-url-sync.spec.ts` — chapter next, F5, Back, exit |
| **Risk**  | Requires test fixtures with publication + chapters        |

---

## Explicitly out of scope

| Item                        | Reason                                                                |
| --------------------------- | --------------------------------------------------------------------- |
| Modal open state in URL     | Not shareable; clutters history                                       |
| Navigation API migration    | `preact-router` sufficient; revisit when browser support is universal |
| `history.state` for content | Size limit; use URL id + fetch/cache                                  |

---

## Implementation notes

- One PR per phase item after Phase 0 merge
- Each PR: code + `routing.mdc` if contract changes + manual checklist from [[02-how-to/sync-url-with-ui-state]]
- Archive this plan (`status: archived`) when Phase 1–2 items are done or deprioritized; update [[project-status]]
