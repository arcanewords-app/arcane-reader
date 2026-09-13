# Adaptive layout contract

How Arcane Reader layouts should adapt. Policies stay in [`design-system.mdc`](../../rules/design-system.mdc). Feature recipes stay in [PATTERNS.md](./PATTERNS.md). This file is the **layout contract** agents execute one surface per PR.

## Product breakpoints (do not add more)

| Band    | Width      | Visual E2E sample (`tests/e2e/viewports.ts`) |
| ------- | ---------- | -------------------------------------------- |
| Phone   | ≤767px     | 390 × 844                                    |
| Tablet  | 768–1023px | **834 × 1112** (inside the band, not on 768) |
| Desktop | ≥1024px    | 1280 × 720                                   |

Optional compact phone: ≤480px — hide chrome only, not a fourth product band. Do **not** add a 1024–1200 “squeeze desktop” band.

## Chrome vs component

- **Page chrome** (Header, ReadingMode bar, sidebar, page shell padding): `@media (min-width: 768px)` / `1024px`.
- **Components** (cards, filter toolbars, comparison tables, request cards): `container-type: inline-size` + `@container` and intrinsic CSS (`auto-fit`, `minmax`, `clamp()`).

Do not drive card/toolbar layout solely from viewport width. A card in a 3-column grid is narrow even on desktop.

`container-type` without `@container` rules is not enough. Reference: [`PublicationCard.css`](../../../src/client/components/Home/PublicationCard.css).

## Mobile-first media

1. Base styles = phone.
2. Enhance with `@media (min-width: 768px)` and `@media (min-width: 1024px)` only.
3. **Forbidden:** `@media (max-width: 768px)` — it overlaps tablet (`min-width: 768px`).
4. **Hide chrome:** `@media (max-width: 767px)` or `480px` for `display: none` / icon-only labels (token chip, logo subtitle, Log in text).
5. **New layout restyle** (padding, grid, type, aspect-ratio): `min-width` or `@container`, not a new `max-width: 767px` block. Existing 767 restyle in older CSS is leftover — migrate when touching that file.

## Grids

Use [`CardGrid`](../../../src/client/components/ui/CardGrid.tsx):

```css
/* phone */
grid-template-columns: 1fr;
/* ≥768 */
repeat(auto-fit, minmax(var(--card-grid-min), var(--card-grid-max)));
```

- `auto-fit` — collapse empty tracks. **Not** “stretch cards across the row”.
- Track growth is capped by `--card-max-publication` / `--card-max-project` / `--card-max-request`. Unbounded `1fr` makes 3 covers poster-sized (prod keeps leftover space on the right).
- `auto-fill` — only for icon/chip strips where empty tracks are intended.
- Floors (`--card-min-*`) must be **> half the phone content width** so a 390px viewport cannot fit two tracks when the ≥768 rule applies.
- Do not wrap the min in `min(100%, …)` on `auto-fit` card grids — percentage mins let shrinkable cards pack two tracks on phone.

## Header overflow

Priority, high → low: logo → primary nav → actions (info, locale, auth) → overflow/wrap.

- **≤1023px:** wrap; primary nav goes to a full-width second row (do not squeeze tablet into one desktop row).
- **≤767px:** hide credits chip; guest Log in is icon-only (`aria-label` kept). Desktop/tablet Log in is text only (no icon).
- Do not shrink type until controls clip. Desktop ≥1024 uses one density — not a squeezed 1024–1200 band.

## Shared primitives

| Primitive    | When                                                 |
| ------------ | ---------------------------------------------------- |
| `PageHeader` | Page title + optional subtitle + primary CTA(s)      |
| `CardGrid`   | Publication / project / history / request card lists |

Do **not** merge `PublicationCard` and `ProjectCard` (different density). Share Cover / Badge / chips.

**PageHeader when not:** info pages with only a title (`info-page-title`); Admin layout chrome (own tabs).

## Visual shells

New or changed **reader** screens need a `*.visual.spec.ts` shell (`layoutMatches`). Logic E2E does not replace pixel shells. Coverage matrix: [testing PATTERNS.md](../testing/PATTERNS.md) § Visual coverage + [`tests/e2e/README.md`](../../../tests/e2e/README.md).

Add `/news/:slug`, contact/legal, extra `/admin/*` shells **only when touching those screens**.

## Anti-patterns

- `auto-fill` for catalog/project/request cards **with unbounded `1fr`** (few cards become posters). Capped `auto-fit` leftover space on the right is intended.
- Visual screenshots on the breakpoint boundary (768).
- `@media (max-width: 768px)` mixed with `@media (min-width: 768px)`.
- Per-page copy of grid column counts instead of `CardGrid`.
- Tailwind / extra 640/1536 / 1024–1200 squeeze bands / foldable-device rules.
- `container-type` with no `@container` rules.

## Status

I0–I5 shipped (Header wrap, CardGrid, visual tablet 834, reader/author shells). Leftover: migrate remaining 767 layout restyle and non-CardGrid collections one surface at a time. See [`docs/05-plans/adaptive-ui.md`](../../../docs/05-plans/adaptive-ui.md).
