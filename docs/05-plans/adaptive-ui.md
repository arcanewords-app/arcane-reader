---
type: plan
status: active
domain: client
canonical: .cursor/skills/ui/RESPONSIVE.md
stale: false
created: 2026-09-13
updated: 2026-09-13
---

# Adaptive UI contract and coverage

Iterative layout work for phone/tablet-first reading. Contract SSOT: [[../_canonical/rules/design-system]] + `.cursor/skills/ui/RESPONSIVE.md`.

## Shipped (I0–I5)

I0–I5 landed as one change (not one surface per PR). P0 symptoms from the original 18 PNG are fixed: Header wrap ≤1023, catalog `CardGrid` `auto-fit`, no `max-width: 768px`, visual tablet **834**, reader/author shells.

| Iteration                  | Status  | Notes                                                    |
| -------------------------- | ------- | -------------------------------------------------------- |
| I0 contract + viewport 834 | done    | RESPONSIVE.md, tokens, visual matrix                     |
| I1 Header overflow         | done    | leftover: compact 1024–1200 squeeze removed in follow-up |
| I2 catalog CardGrid        | done    | Publication/Project/history                              |
| I3 reader shells           | done    | publication, reading, news **list**, profile             |
| I4 author workspace        | done    | projects, overview, chapter, reading                     |
| I5 leftover routes         | partial | requests + admin **users** + about                       |

Pixel shells: `npm run test:e2e:visual` / `test:e2e:update-snapshots`. Not a merge gate.

## Leftover (do not treat as “fully container-query”)

- **Visual shells when those screens are touched:** `/news/:slug`, `/contact`, `/privacy`, `/terms`, `/admin/news|publications|projects|entities`. Do not add shells speculatively.
- **Migrate one surface at a time:** glossary / pseudonym / entity-picker grids still `auto-fill`; most `max-width: 767px` blocks still restyle layout (legacy). New restyle = `min-width` or `@container`.
- Info/admin titles are not `PageHeader` (no primary CTA / own chrome).
