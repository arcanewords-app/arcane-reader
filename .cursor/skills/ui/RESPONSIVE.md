# Adaptive layout contract

How Arcane Reader layouts should adapt. Policies stay in [`design-system.mdc`](../../rules/design-system.mdc). Feature recipes stay in [PATTERNS.md](./PATTERNS.md). This file is the **layout contract** agents execute one surface per PR.

## Product breakpoints (do not add more)

| Band    | Width      | Visual E2E sample (`tests/e2e/viewports.ts`) |
| ------- | ---------- | -------------------------------------------- |
| Phone   | ≤767px     | 390 × 844                                    |
| Tablet  | 768–1023px | **834 × 1112** (inside the band, not on 768) |
| Desktop | ≥1024px    | 1280 × 720                                   |

Optional compact phone: ≤480px — hide chrome only, not a fourth product band.

## Chrome vs component

- **Page chrome** (Header, ReadingMode bar, sidebar, page shell padding): `@media (min-width: 768px)` / `1024px`.
- **Components** (cards, filter toolbars, comparison tables, request cards): `container-type: inline-size` + `@container` and intrinsic CSS (`auto-fit`, `minmax`, `clamp()`).

Do not drive card/toolbar layout solely from viewport width. A card in a 3-column grid is narrow even on desktop.

## Mobile-first media

1. Base styles = phone.
2. Enhance with `@media (min-width: 768px)` and `@media (min-width: 1024px)` only.
3. **Forbidden:** `@media (max-width: 768px)` — it overlaps tablet (`min-width: 768px`) and our old visual tablet was exactly 768.
4. **Allowed exceptions:** `@media (max-width: 767px)` or `480px` to _hide_ chrome (token chip, logo subtitle, button labels).

## Grids

Use [`CardGrid`](../../../src/client/components/ui/CardGrid.tsx):

```css
repeat(auto-fit, minmax(var(--card-grid-min), 1fr));
```

- `auto-fit` — few cards grow; empty tracks collapse.
- `auto-fill` — only for icon/chip strips where empty tracks are intended.
- `--card-min-publication` / `--card-min-project` in `variables.css`. Floors must be **> half the phone content width** so 390px stays one column.
- Do not wrap the min in `min(100%, …)` on `auto-fit` card grids — percentage mins let shrinkable cards pack two tracks on phone.

## Header overflow

Priority, high → low: logo → primary nav → actions (info, locale, auth) → overflow/wrap.

- **≤1023px:** wrap; primary nav goes to a full-width second row (do not squeeze tablet into one desktop row).
- **≤767px:** hide credits chip; guest Log in is icon-only (`aria-label` kept).
- Do not shrink type until controls clip. Tablet is compact chrome, not a squeezed desktop.

## Shared primitives

| Primitive    | When                                             |
| ------------ | ------------------------------------------------ |
| `PageHeader` | Page title + optional subtitle + primary CTA(s)  |
| `CardGrid`   | Publication / project / history card collections |

Do **not** merge `PublicationCard` and `ProjectCard` (different density). Share Cover / Badge / chips.

## Visual shells

New or changed **reader** screens need a `*.visual.spec.ts` shell (`layoutMatches`). Logic E2E does not replace pixel shells. Coverage matrix: [testing PATTERNS.md](../testing/PATTERNS.md) § Visual coverage + [`tests/e2e/README.md`](../../../tests/e2e/README.md).

## Anti-patterns

- `auto-fill` for catalog/project cards (narrow columns + empty space).
- Visual screenshots on the breakpoint boundary (768).
- `@media (max-width: 768px)` mixed with `@media (min-width: 768px)`.
- Per-page copy of grid column counts instead of `CardGrid`.
- Tailwind / extra 640/1536 bands / foldable-device rules.

## Iteration order

I1 Header → I2 catalog/cards → I3 reader visual shells → I4 author workspace → I5 leftover routes. One surface per PR when possible.
