---
type: reference
status: active
domain: meta
stale: false
updated: 2026-05-16
---

# Dependency graphs

Module dependency maps for Arcane Reader, generated with [madge](https://github.com/pahen/madge).

## Generated artifacts

| File               | Description                                                                 |
| ------------------ | --------------------------------------------------------------------------- |
| [[file-deps]]      | **File-level** `importer → imported` + reverse lookup (search / AI context) |
| [[client-deps]]    | Folder-level Mermaid graphs (client + server) — architecture overview       |
| [[circular-deps]]  | Circular import chains (should stay empty)                                  |
| [[orphans]]        | Modules nothing imports (entry points or dead code)                         |
| `client-graph.svg` | Full client graph (requires Graphviz)                                       |
| `server-graph.svg` | API / services graph (requires Graphviz)                                    |
| `engine-graph.svg` | Translation engine only (requires Graphviz)                                 |

Files marked **generated** in frontmatter are overwritten by `npm run docs:deps`.

## Commands

```bash
# Regenerate all markdown (+ SVG if Graphviz is installed)
npm run docs:deps

# Fast circular-deps check only (~2–5s)
npm run check:circular

# Debug Graphviz / PATH / GRAPHVIZ_BIN
npm run check:graphviz
```

## When to regenerate

| Trigger                           | Action                                                                                                   |
| --------------------------------- | -------------------------------------------------------------------------------------------------------- |
| Every commit                      | Husky: Prettier + ESLint/Stylelint on **staged** files; `check:circular` when `src/**/*.{ts,tsx}` change |
| Before PR / after large refactor  | `npm run docs:deps` then commit `docs/01-reference/dependency-graphs/`                                   |
| New top-level module under `src/` | Regenerate so Mermaid overview stays accurate                                                            |

## Graphviz (optional, for SVG)

Madge needs [Graphviz](https://graphviz.org/) for `.svg` output. Markdown/Mermaid works without it.

**Windows**

```powershell
winget install graphviz
```

Add Graphviz `bin` (e.g. `C:\Program Files\Graphviz\bin`) to `PATH`, then restart the terminal.

Or point madge at the bin folder without editing PATH:

```powershell
$env:GRAPHVIZ_BIN = "C:\Program Files\Graphviz\bin"
npm run docs:deps
```

Run `npm run check:graphviz` to see which paths were checked and whether `gvpr` runs.

**macOS / Linux**

```bash
brew install graphviz   # macOS
sudo apt install graphviz   # Debian/Ubuntu
```

## How analysis is split

Client and server use different TypeScript configs (path aliases, module resolution). The generator runs **two madge passes**:

- **Client** — `src/client`, `tsconfig.client.json` (`@/*` aliases)
- **Server** — `src/server.ts`, `src/engine`, `src/services`, `src/middleware`, `src/api`, `tsconfig.json`
- **Engine** — separate SVG for `src/engine` only

`import type` is skipped (`skipTypeImports`) so type-only edges do not clutter runtime graphs.

## AI / Cursor session context

For tasks involving imports, layering, or “who uses this file”:

```
@docs/01-reference/dependency-graphs/file-deps.md
```

Prefer **file-deps** over [[client-deps]] when you need exact paths; use [[client-deps]] for folder-level overview.

## Canonical code map

For human-oriented module responsibilities, see [[_canonical/rules/architecture]] and [[Home#Module map]].
