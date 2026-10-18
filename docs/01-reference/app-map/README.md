---
type: reference
status: active
domain: meta
stale: false
updated: 2026-10-18
---

# App map

User-flow map for Arcane Reader. Screens, where a person can go next, and the API calls behind each screen. This is not the import graph (`npm run docs:deps`).

## Open it

[index.html](index.html) — open the file in a browser. No dev server. The first view is a product overview (scale and features). A click opens the calls. «Как устроено» is the same data as columns.

[app-map.json](app-map.json) — the same data. Agents should not read this file whole. Ask a slice:

```bash
npm run docs:app-map:query -- --screen /p/:publicationId
npm run docs:app-map:query -- --api /api/publications
```

Skill: `.cursor/skills/app-map/SKILL.md`.

## Regenerate

```bash
npm run docs:app-map
```

The command rewrites `index.html` and `app-map.json` from `src/`. Do not edit those two files. `npm run test` fails when the committed JSON differs from a fresh extract and tells you to run the command again.

Hand-maintained list: `scripts/app-map/overrides.ts` (shell files, `/profile` access, Russian area names, the one-line product sentence, demo paths per role). A new screen, `route()`, API method, or `app.get`/`app.post` is picked up without editing the generator. A demo path that disappeared from the router becomes a warning in the JSON.
