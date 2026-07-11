---
type: how-to
status: active
domain: client
canonical: .cursor/rules/spa-navigation.mdc
stale: false
created: 2026-07-11
updated: 2026-07-12
---

# How to sync URL with UI state

Step-by-step for Preact features that change what the user sees. Policy: [[_canonical/rules/spa-navigation]].

## 1. Decide if state is shareable

| Shareable → URL                        | Keep off URL                          |
| -------------------------------------- | ------------------------------------- |
| Current chapter, tab, filter           | Modal open/closed                     |
| Selected entity in a list view         | Scroll position (unless product asks) |
| Search prefill for a page              | Unsaved form text                     |
| "Which panel" when user would bookmark | Loading spinners                      |

If another user should open the same link and see the same view, put it in the URL.

## 2. Add a URL builder

Centralize path/query construction in `src/client/utils/`:

```typescript
// src/client/utils/readingRoutes.ts (excerpt)
export function buildReadingChapterUrl(params: {
  isPublicationMode: boolean;
  publicationPath?: string;
  publicationId?: string;
  projectId?: string;
  chapterId: string;
}): string | null {
  // ...
  return `/p/${path}/chapters/${chapterId}/reading`;
}
```

Catalog example: `buildCatalogUrl()` in `src/client/utils/catalogRoutes.ts`. When the user is already on `/` or `/catalog`, builders keep the current path segment so query-only navigation does not remount `HomePage`.

## 3. Update URL on every navigation path

Import `route` from `preact-router`. Call it from **all** entry points: buttons, keyboard, TOC, programmatic jumps.

```typescript
// ReadingMode — guard avoids redundant history entries
const syncChapterUrl = useCallback((targetChapterId: string, replace = false) => {
  const url = buildReadingChapterUrl({ /* ... */, chapterId: targetChapterId });
  if (!url || window.location.pathname === url) return;
  route(url, replace);
}, [/* deps */]);
```

**Order:** persist side effects first (e.g. `onSavePosition`), then `route()`.

Use `route(url, true)` for replace when canonicalizing an entry URL (see `ReadingModePage` redirect from `/projects/:id/reading`).

## 4. Read state from URL

**Path params:** page receives `chapterId` from `preact-router`; pass to child as `initialChapterId`.

**Query params:** read on mount and on history events. Prefer `useUrlSync` + route builders (see `catalogRoutes.ts`, `profileRoutes.ts`):

```typescript
// HomePage.tsx — catalog filters via useUrlSync
const { state, setState } = useUrlSync({
  parse: () => sanitizeCatalogUrlStateForAuth(parseCatalogUrlState(), isAuthor),
  build: buildCatalogUrlFromState, // pathname-aware: / or /catalog
  pathnameGuard: () => isCatalogPath(window.location.pathname),
  historyMode: 'push',
});
```

Legacy manual listener pattern (if not using `useUrlSync`):

Sync index/state when URL identity changes; use a ref to avoid resetting on unrelated parent re-renders (`lastInitialChapterIdRef` in `ReadingMode`).

## 5. Avoid loading flash on param-only changes

When only `:chapterId` (or query) changes, do **not** re-fetch page-level data that does not depend on the new param.

`PublicationReadingPage` loads read progress **once per publication mount** (`progressLoaded`), not on every `chapterId` change — prevents a full-page spinner when flipping chapters.

`HomePage` splits `initialLoading` (first mount) from `refreshing` (tab/filter refetch) so switching «Мои работы» on `/` does not flash a full-page spinner.

## 6. Update routing docs

If you add or change path segments or query contracts:

- `@.cursor/rules/routing.mdc`
- `src/client/AppRouter.tsx`
- `src/server.ts` SPA fallback (if new public path)

## 7. Manual test checklist

- [ ] Navigate in-app → URL updates
- [ ] F5 → same view
- [ ] Browser Back → previous view, correct content
- [ ] Share/copy link → opens same view
- [ ] No full-page spinner when only param changes
- [ ] Invalid URL → sensible fallback (first chapter, default filter)

## Related

- Concept: [[03-explanation/addressable-ui-state]]
- Rollout backlog: [[05-plans/app-wide-url-sync-rollout]]
- New features: [[02-how-to/add-feature]]
