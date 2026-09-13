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

## Approach

- Viewport media for page chrome (Header, ReadingMode, sidebar).
- Container queries + `CardGrid` (`auto-fit`) for cards/toolbars/tables.
- No `@media (max-width: 768px)` — it overlaps tablet. Visual tablet is **834**, not 768.
- Shared primitives: `PageHeader`, `CardGrid`. Do not merge `PublicationCard` and `ProjectCard`.

## Iterations

1. **I0** — Contract (RESPONSIVE.md, tokens, viewport 834).
2. **I1** — Header overflow: wrap ≤1023; icon-only Log in ≤767.
3. **I2** — Catalog `CardGrid` + card meta that does not split “Language / chapters”.
4. **I3** — Visual shells: publication, reading, news, profile.
5. **I4** — Author workspace pages + visual shells.
6. **I5** — Requests, admin, about.

Pixel shells: `npm run test:e2e:visual` / `test:e2e:update-snapshots`. Not a merge gate.
