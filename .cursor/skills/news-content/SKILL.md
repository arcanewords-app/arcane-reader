---
name: news-content
description: Write product news posts and announcement banners for Arcane Reader in a technical-startup voice (Linear/Vercel/Stripe changelog). Use when drafting /news posts, release notes, announcement banner copy, or restyling marketing copy. Drafts live in docs/05-plans/news-drafts/.
---

# News & Announcement Writing (Arcane Reader)

Codifies the voice, structure, and workflow for `/news` posts and announcement banners. Product surfaces and data model: [[03-explanation/news-and-announcements]]. Admin steps: [[02-how-to/manage-news-announcements]].

## Voice: technical-startup changelog

Write like a product team that respects the reader's time (Linear / Vercel / Stripe changelog). User-facing copy is **Russian** (default app locale `ru`); UI/feature names follow the app's `ru.json`.

| Do                                                                   | Don't                                                  |
| -------------------------------------------------------------------- | ------------------------------------------------------ |
| Lead with what shipped and why it matters                            | Open with "Мы рады сообщить" / "Мы добавили"           |
| Concrete nouns, numbers, examples (`50K токенов`, `до 2000 записей`) | Vague superlatives ("мощный", "невероятный", "лучший") |
| Active voice, present tense ("Переводите с корейского")              | Passive corporate ("была добавлена возможность")       |
| Short sentences; one idea per line                                   | Multi-clause sentences with filler                     |
| Show with a table / code / steps                                     | Walls of prose                                         |
| Confident, calm                                                      | Exclamation spam, hype, emoji as decoration            |
| Address the reader ("вы") and segment by need                        | Talk about ourselves                                   |

Rule of thumb: if a sentence doesn't add information the reader can act on, cut it.

## Structure of a post body

1. **Hook (1-2 lines):** the benefit or the problem it solves. No preamble.
2. **Primary CTA** right after the hook when there's a destination (`[Открыть … →](/path)`).
3. **One scannable core block:** a single comparison/feature table or a short numbered "how to" — not two stacked tables.
4. **"Какой вариант ваш" / segmentation** (optional): map the feature to reader types by behavior, not by tier name.
5. **Closing CTA / next step:** where to go, what's coming next. One line.

Keep bodies tight: aim ≤ ~40 lines of markdown. Headings `##`/`###`, lists `-` or `1.`, `**bold**` for key numbers, `[links](/path)` for in-app routes.

## Supported markdown in body

Posts render via [`src/client/utils/simpleMarkdown.ts`](../../src/client/utils/simpleMarkdown.ts). **Use only this syntax** in Body:

| Supported                              | Not supported                 |
| -------------------------------------- | ----------------------------- |
| `##`, `###` headings                   | `#` h1 (use post title field) |
| `**bold**`, `*italic*`                 | Images `![](...)`             |
| `[text](/path)`, `[text](https://...)` | Blockquotes `>`               |
| `-` bullet lists                       | Raw HTML                      |
| `1.` numbered lists                    | Nested lists beyond one level |
| GFM tables (`\| col \|`, `\|---\|`)    |                               |
| ` ``` ` fenced code blocks             |                               |

Tables: include separator row after header. Empty cells OK (`| | Col |`). Pipes inside code fences are not parsed as tables.

## Titles & summaries

- **title:** benefit- or question-led, specific. Good: "Сколько глав можно перевести за день? Теперь видно сразу". Weak: "Уровни аккаунта: что входит в каждый тариф".
- **summary:** one sentence, ≤ ~160 chars, states the value. Reused as banner default — make it work standalone.
- **slug:** lowercase-with-hyphens, stable, English (`new-language-pairs`, `account-tiers`).

## Announcement banner copy

Banner is a short proactive nudge (`announcement_alerts`, ≤160 chars), separate from the post.

- One message, one idea. Can use a single light "→ скоро" teaser.
- Match `banner_style`: `info` (neutral release), `promo` (discount/offer), `neutral` (low-key).
- `min_role` gates audience (`guest` = everyone). Don't promise author-only features in a guest banner.
- Example: "Теперь переводим с корейского и китайского. Японский — скоро!"

## What to announce vs. skip

| Announce (user-facing value)            | Skip (internal / dev-only)             |
| --------------------------------------- | -------------------------------------- |
| New language pairs, locales             | Prompt Lab, evaluator                  |
| Glossary import/export, reader features | Axiom / observability, logging         |
| Reporting, publishing, exports          | Scraper migration, debug console       |
| Account tiers / limits clarity          | Refactors, CI, infra without UX change |

When in doubt: "can a reader or author _do_ something new?" If no, don't ship a post.

## Draft template

Save drafts to `docs/05-plans/news-drafts/<slug>.md`. Frontmatter carries the admin fields so publishing is copy-paste:

```markdown
---
type: news-draft
status: draft
slug: <slug>
category: feature | discount | update | other
published_at: YYYY-MM-DD
banner: true | false
banner_message: '<=160 chars' # only if banner: true
banner_style: info | promo | neutral
banner_min_role: guest | user | author | author_plus | super_author
---

# <Title>

## Admin fields

| Field            | Value        |
| ---------------- | ------------ |
| **title**        | …            |
| **summary**      | …            |
| **slug**         | `<slug>`     |
| **category**     | `<category>` |
| **published_at** | YYYY-MM-DD   |

### Announcement banner <!-- only if banner: true -->

| Field        | Value                     |
| ------------ | ------------------------- |
| **message**  | …                         |
| **style**    | `info`                    |
| **min_role** | `guest`                   |
| **CTA**      | Learn more → /news/<slug> |

---

## Body (markdown для Admin → Body)

<post body following the structure above>
```

## Workflow

1. Read the source commit(s) / feature; verify behavior against `src/` (don't trust commit messages alone).
2. Pick angle + category; confirm it passes the "announce vs skip" test.
3. Draft `docs/05-plans/news-drafts/<slug>.md` from the template.
4. Self-check against the voice table and structure (hook → CTA → one core block → CTA).
5. Hand off: user publishes via `/admin/news` ([[02-how-to/manage-news-announcements]]). Drafts are not auto-synced to the DB.

## Verify feature facts before writing

Anchor every claim in code, not memory:

| Claim type             | Source of truth                                                             |
| ---------------------- | --------------------------------------------------------------------------- |
| Language pairs         | `src/client/constants/translationLanguages.ts`, `src/engine/prompts/pairs/` |
| Token limits / tiers   | `src/config/tokenLimits.ts`, `src/shared/accountTiers.ts`                   |
| Glossary import/export | `src/services/glossaryImportExport.ts`, `src/api/schemas/glossary.ts`       |
| UI labels / routes     | `src/client/locales/ru.json`, `.cursor/rules/routing.mdc`                   |

If a number or label can't be confirmed in `src/`, leave a `TODO:` in the draft instead of guessing.
