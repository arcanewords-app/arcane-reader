---
type: plan
status: active
domain: seo
created: 2026-06-01
canonical: .cursor/rules/seo.mdc
---

# SEO content guide for authors (publications)

Help readers and search systems discover your translation. Follow [Google helpful content](https://developers.google.com/search/docs/fundamentals/creating-helpful-content) — unique, people-first text, not keyword lists.

## When publishing

| Field                            | Recommendation                                                                                                            |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| **Title**                        | Clear book name; avoid duplicate titles across your catalog                                                               |
| **Description**                  | 2–4 sentences: what the work is, tone, why read _this_ translation; include author (original) and your role as translator |
| **Cover**                        | Square image, readable at thumbnail size                                                                                  |
| **Author / translator entities** | Link global author and translator entities when available                                                                 |
| **Tags**                         | Few relevant tags; do not spam unrelated genres                                                                           |
| **Slug**                         | Stable URL slug; changing slug breaks old links                                                                           |

## Do

- Write description yourself from having worked on the project
- Mention source language and target language when useful
- Note if EPUB/FB2 export is available (readers and snippets may reference downloads)
- Keep glossary entries consistent with published spelling

## Do not

- Copy another site’s synopsis without adding your editorial angle
- Stuff keywords or create near-duplicate descriptions across books
- Publish with empty or one-line description (“ранобэ”, “перевод”) only
- Expect FAQ schema or `llms.txt` to boost rankings (not used by Google Search for visibility)

## After publish

- Open the public URL `/p/{slug}` and confirm title/description in browser tab
- Request indexing in Search Console once the property exists (see [`seo-search-console.md`](seo-search-console.md))

## Related

- Baseline audit: [`seo-audit-2026-06-01.md`](seo-audit-2026-06-01.md)
- Agent checklist: `.cursor/skills/seo/SKILL.md` mode `content`
