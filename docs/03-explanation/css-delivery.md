---
type: explanation
status: active
domain: client
canonical: .cursor/rules/design-system.mdc
stale: false
created: 2026-10-04
updated: 2026-10-04
---

# CSS delivery: GitHub Primer vs Arcane Reader

Research note. Source: [Improving site performance by shipping more CSS](https://github.blog/engineering/architecture-optimization/improving-site-performance-by-shipping-more-css/) (Josh Black, Marie Lucca, GitHub Blog, 2026-09-25). Compared against client code on 2026-10-04.

**Conclusion:** Arcane Reader already sits where GitHub landed. Styles are static CSS, themes are CSS variables, and there is no style runtime. Do not adopt CSS Modules or a CSS-in-JS migration. The only related lever — splitting CSS by route — is not worth doing at the current stylesheet size.

## What GitHub changed

Primer (their design system) used `styled-components` plus an `sx` prop. By 2023, pages with many components paid for it three ways:

- First paint waited while styles initialized on the client.
- Server render slowed down once style collection moved to the server.
- Style updates got more expensive as the component count on a page grew.

They moved to **CSS Modules**: a CSS file next to the component, local class names, native CSS, no client or server runtime. Styles ship as a stylesheet with the HTML. The CSS payload got larger; the runtime cost of collecting styles disappeared. That is the title: they got faster by shipping more CSS.

Migration was per component, without a flag day:

1. Add a CSS Module beside the old styles.
2. Feature-flag the switch.
3. Require visual-regression snapshots to match.
4. Roll out team → staff → all users.

By December 2024 every Primer component was on CSS Modules: **55% less** server-render time, **25% less** component init time.

The long tail was `sx` — an inline style object in JSX. It had TypeScript and design-token support, and it was computed at runtime. Peak was about **7,760** usages. They shipped two packages in parallel: `@primer/react` (CSS Modules, no `styled-components`) and `@primer/styled-react` (wrapper that still accepted `sx`). From April 2025 to May 2026, eight engineers plus a codemod removed 6,419 props (per-page SSR **1–22%** faster). Two engineers and Copilot coding agent cleared the last 895 in three weeks.

Theming was the last blocker. Seven themes, each with a high-contrast variant, were wired through JavaScript utilities in `styled-components`. The variables themselves already lived in CSS (`@primer/css`). They removed the JS layer and feature-flagged the dependency deletion. As of June 2026, github.com is 100% CSS Modules.

## How Arcane Reader ships CSS

Verified in `src/client/`. There is no `styled-components`, Emotion, or other CSS-in-JS.

| Piece        | Where                                                              | Behavior                                                                         |
| ------------ | ------------------------------------------------------------------ | -------------------------------------------------------------------------------- |
| Colocation   | `import './Component.css'` next to the component                   | Required by [[_canonical/rules/client]]                                          |
| Tokens       | `src/client/styles/base/variables.css`                             | Colors, type, space, radius, motion                                              |
| Entry        | `src/client/styles/index.css`, imported from `src/client/main.tsx` | Base, layout, shared page styles                                                 |
| Chrome theme | `data-theme` on `<html>` via `src/client/utils/appTheme.ts`        | Dark is the default (`:root`, attribute absent). Light sets `data-theme="light"` |
| Reader theme | `data-reader-theme` and `--reader-*`                               | Separate from site chrome. See [[05-plans/reader-theme-improvements]]            |
| Bundle       | Vite, `vite.config.ts`                                             | CSS extracted at build time. No style collection at request time                 |
| Routes       | `src/client/AppRouter.tsx`                                         | Pages are static imports. No route-level `import()`                              |

Server HTML for crawlers (`serveStaticPageHtml` and publication/news SSR in [[_canonical/rules/routing]]) is meta and hidden content. It does not render the Preact tree or collect component styles. GitHub's SSR style-collection cost does not apply here.

Class names are **global**. We do not use `*.module.css`. At ~90 component stylesheets that is acceptable; GitHub's scale is what made local class names necessary.

Inline styles are discouraged ([[_canonical/rules/client]], [[_canonical/rules/design-system]]). A few one-off inline styles remain. There is no `sx`-style API.

## Comparison

|                   | GitHub before                                | GitHub after (June 2026)   | Arcane Reader                                         |
| ----------------- | -------------------------------------------- | -------------------------- | ----------------------------------------------------- |
| Authoring         | `styled-components` + `sx`                   | CSS Modules, local classes | Plain CSS, global classes                             |
| When styles apply | Client init and SSR collection               | Stylesheet in HTML         | Vite build extracts CSS                               |
| Themes            | JS utilities over CSS variables              | CSS variables only         | `data-theme` / `data-reader-theme` over CSS variables |
| Scale             | Thousands of `sx` props, 7 themes × contrast | Same surface, no runtime   | ~90 CSS files, two chrome themes plus reader presets  |

## What not to copy

- **CSS Modules migration.** Encapsulation would remove a class-name collision risk we do not have in practice. The migration machinery they needed (dual packages, feature flags, visual regression, codemods) is larger than the problem.
- **"Ship more CSS" as a performance project.** Their extra CSS bytes replaced a JS runtime. Our CSS is already static. Adding bytes does not buy the same thing.
- **Route-level CSS splitting.** Because every page is a static import, the catalog downloads admin and editor CSS too. That is the inverse of their lesson, and it only matters if the stylesheet becomes a measured cost. It is not one today.

## See also

- [[_canonical/rules/client]] — colocate `Component.css`
- [[_canonical/rules/design-system]] — tokens, `data-theme`, reader theme boundary
- [[05-plans/reader-theme-improvements]] — reader presets, not site chrome
- `src/client/styles/base/variables.css`
- `src/client/utils/appTheme.ts`
