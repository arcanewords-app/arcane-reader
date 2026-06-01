# SEO Skill (Arcane Reader)

Utility skill for audits, content discoverability, and Search Console ops. **Not** a third-party SEO script pack.

## When to use

- SEO audit, indexing, sitemap, robots, meta, JSON-LD, Search Console
- Publication/catalog content quality for search and AI Overviews
- After edits to `src/server.ts` SEO blocks or `usePageMeta.ts`

Read [`.cursor/agents/seo/AGENT.md`](../../agents/seo/AGENT.md) and [`.cursor/rules/seo.mdc`](../../rules/seo.mdc) in the same turn.

## Modes

| Mode        | Focus                                                                                                |
| ----------- | ---------------------------------------------------------------------------------------------------- |
| `audit`     | Full baseline or diff vs last `seo-audit-*.md`                                                       |
| `content`   | Publication descriptions, authors, tags, catalog uniqueness                                          |
| `technical` | Crawl, index, SSR meta, schema, CWV sample                                                           |
| `gsc`       | [`docs/05-plans/seo-search-console.md`](../../../docs/05-plans/seo-search-console.md) checklist only |

## Production base URL

Use `PUBLIC_URL` from deployment env (see `env.example.txt`). Example production host: `https://arcane-reader.vercel.app` (no trailing slash in checks; curl paths append `/robots.txt` etc.).

If unknown, ask the user once — do not guess alternate domains.

## Audit checklist (Arcane-specific)

### Technical

1. `GET {PUBLIC_URL}/robots.txt` — `Allow: /`, `Disallow` for `/profile`, `/projects`, `/admin`; `Sitemap:` line
2. `GET {PUBLIC_URL}/sitemap.xml` — valid XML, `/`, static pages, `/p/{slug}` entries
3. Sample HTML (view-source or `curl -s`):
   - `/` and `/catalog` — unique title/description where intended; `/catalog` canonical → `/` on SSR
   - `/p/{slug}` — injected title, description, `og:*`, `link rel="canonical"`, JSON-LD `Book`
   - `/p/{slug}/chapters/{id}/reading` — chapter title suffix, breadcrumb JSON-LD
4. Confirm server HTML includes hidden crawler content: `<main class="publication-page-seo">` inside `#app` for publication routes
5. Client: after in-app navigation, `usePageMeta` updates without contradicting SSR on refresh
6. Optional: [PageSpeed Insights](https://pagespeed.web.dev/) on `/` and one `/p/*` URL

### Content and traffic

1. Sample publications via `GET /api/publications?limit=20` — count short/empty `description`
2. Sitemap: note if publication count approaches 1000 URL cap or >100 pubs without chapter URLs (see `SITEMAP_CHAPTER_PUBS_LIMIT` in `routing.mdc`)
3. Internal links: catalog cards → `/p/*`; publication → reading; entity filters on `/catalog?author=`
4. Reject advice that violates Google AI guide (see `seo.mdc`)

### GSC (human-ops)

Follow [`seo-search-console.md`](../../../docs/05-plans/seo-search-console.md). Agent documents status; user executes property verification and sitemap submit.

## Evidence tools

- `curl -sI` / `curl -s` for headers and HTML (PowerShell: `curl.exe` on Windows VM)
- Browser view-source on production
- Search Console (when property exists)
- `site:{domain}` in Google (optional)

Do **not** add Python SEO script dependencies to this repo for routine audits.

## Report format

Save to `docs/05-plans/seo-audit-YYYY-MM-DD.md`:

```yaml
---
type: plan
status: active
domain: seo
created: YYYY-MM-DD
canonical: .cursor/rules/seo.mdc
---
```

Per finding:

```markdown
## Finding: Short title

- Severity: Critical | Warning | Info
- Evidence: ...
- Impact: ...
- Fix: ...
- Confidence: Confirmed | Likely | Hypothesis
- Owner: API | UI | Backend | human-ops
```

End with prioritized **Action plan** (numbered, owners).

Update `seo-search-console.md` checkboxes when GSC steps are done or new gaps found.

## Code references

| File                                        | Role                                                                          |
| ------------------------------------------- | ----------------------------------------------------------------------------- |
| `src/server.ts`                             | `sendRobotsTxt`, `sendSitemapXml`, `servePublicationHtml`, `STATIC_SEO_PATHS` |
| `api/sitemap.ts`                            | Vercel sitemap handler (mirror limits)                                        |
| `src/client/hooks/usePageMeta.ts`           | Client-side meta + JSON-LD                                                    |
| `index.html`                                | Default meta                                                                  |
| `docs/05-plans/seo-author-content-guide.md` | Author content checklist                                                      |
| `docs/05-plans/seo-search-console.md`       | GSC ops                                                                       |

## Quarterly regression

**Schedule:** at least once per calendar quarter (Jan / Apr / Jul / Oct), or within 2 weeks after a major public SEO release.

**Steps:**

1. Run `audit` mode against current `PUBLIC_URL`
2. Write new `docs/05-plans/seo-audit-YYYY-MM-DD.md`
3. Compare to previous audit: resolved / open / new Critical items
4. Archive prior audit plan: set `status: archived` in frontmatter when superseded
5. Invoke **verifier** if any `src/` SEO code changed since last audit

**After any SEO code change** (same sprint, not only quarterly):

- Verifier: `npm run lint:all`
- Spot-check 3 URLs: `/`, one `/p/*`, one chapter reading URL
- Confirm `routing.mdc` SEO section still matches `server.ts`

## Implementation handoff

| Finding type                              | Agent     |
| ----------------------------------------- | --------- |
| SSR meta, sitemap, robots, JSON-LD server | API       |
| `usePageMeta`, catalog/publication UI     | UI        |
| DB fields, publication API                | Backend   |
| GSC, analytics consent, PSI manual        | human-ops |

Do not implement engine/auth changes under SEO tasks.
