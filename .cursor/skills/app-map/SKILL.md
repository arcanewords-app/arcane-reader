---
name: app-map
description: Read the client flow map before a user-facing feature, a new screen or route, or a question about what a screen calls and which neighboring flows it affects. Use when adding or changing a page, navigation, or an API the UI calls.
---

# App map

Screens, where a person can go next, and the API calls behind each screen. Source: `docs/01-reference/app-map/app-map.json`, generated from `src/`. The HTML next to it is for people. Do not read the HTML, and do not read the whole JSON.

## When to use

Before editing a user-facing flow: a page, a `route()` / href, or a client `api.*` method. Also when the question is "what does this screen call?" or "what else breaks if this screen changes?"

## Ask

From the repo root:

```bash
npm run docs:app-map:query -- --screen /p/:publicationId
npm run docs:app-map:query -- --api /api/publications
```

`--screen` accepts a pattern or a concrete path (`/p/abc` matches `/p/:publicationId`). It prints that screen, where it goes, and each call with handler, services, and `engine` / `queue` tags. Neighbors are one line each — query them separately if you need their calls.

`--api` prints matching endpoints and which screens call them. A short prefix matches longer paths (`/api/publications` includes `/api/publications/:id/chapters`).

No arguments: a list of screens only (access, path, title).

If the command prints `warnings`, read them. A missing handler or a demo path that left the router is a hole in the map, not something to skip.

## After a change

If you changed a client route, a `route()` / href, or an API method, regenerate and leave the generated files in the same change:

```bash
npm run docs:app-map
```

`npm run test` fails when the committed JSON is older than the source. Do not hand-edit `app-map.json` or `index.html`. The short hand list is `scripts/app-map/overrides.ts` (shell, `/profile` access, area names, demo paths).
