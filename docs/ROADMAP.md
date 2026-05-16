---
type: reference
status: active
domain: meta
stale: false
created: 2026-05-16
updated: 2026-05-16
canonical: docs/project-status.md
---

# Arcane Reader — Global Roadmap

Master plan for product updates and documentation context. Use with [[project-status]] for tactical snapshots.

## Purpose and how to use

### For humans (Obsidian)

- Start here for **priorities and history**, then open linked plans in [[05-plans/]].
- Update this file when priorities shift or a phase completes.

### For AI (Cursor)

Attach at the start of large sessions:

```
@docs/ROADMAP.md
@docs/project-status.md
```

Add domain context as needed: `@.cursor/rules/engine.mdc`, `@docs/02-how-to/debug-translation`, etc.

### Truth hierarchy

1. **`src/`** — behavior
2. **`.cursor/rules/*.mdc`** — agent SSOT (conventions, routes, policies)
3. **`docs/` vault** — plans, ADR, how-to, this roadmap
4. **`docs/archive/`** — legacy; possibly stale

See [[_meta/conventions]] for full rules.

### Workflow

```
Code → Rule (if pattern changes) → 05-plans/ detail → update ROADMAP + project-status
```

---

## Documentation system (Phase 0 — completed)

Context preserved from May 2026 documentation setup.

| Milestone | Deliverable |
|-----------|-------------|
| Rules SSOT | 11 rules in `.cursor/rules/`: core, architecture, api, routing, cache, auth, engine, client, design-system, deployment, logging |
| Vault skeleton | [[Home]], `_meta/`, `00-start` … `06-runbooks`, `templates/`, junction `_canonical/rules/` |
| Legacy triage | 74 files → [[archive/README]] with `stale: true`; triage log in [[_meta/archive-triage]] |
| ADR | [[04-decisions/adr-0000-rules-first-documentation-ssot]] |
| How-to | [[02-how-to/run-locally]], [[02-how-to/add-feature]], [[02-how-to/debug-translation]] |
| AI anchors | [[project-status]], `Active Plans.base` (Obsidian) |
| Repo integration | `AGENTS.md`, `README.md`, `docs/` un-ignored in `.gitignore` |

Route map SSOT: [[_canonical/rules/routing]] (not `docs/ROUTES.md` stub).

---

## Product state (verified snapshot)

| Area | Status |
|------|--------|
| Public catalog & publications | `/`, `/catalog`, `/p/:id`, reading mode |
| Author workspace | Projects, chapters, glossary, merge suggestions |
| Translation pipeline | Analyze → Translate → Edit; text block markers |
| Import / export | EPUB, FB2; publication build-exports |
| Token limits | Daily usage API + UI; middleware enforcement |
| Async jobs | BullMQ analysis/translate (Redis + worker) |
| SEO (technical) | robots.txt, sitemap.xml, dynamic publication meta |
| UI i18n | ru / en / pl + header locale switcher |

Details and tech debt: [[project-status]].

---

## Priority roadmap

### P0 — Engine quality (core product)

| ID | Theme | Plan | Open work (summary) |
|----|-------|------|---------------------|
| **E1** | Stage 3 paragraph alignment | [[05-plans/engine-pipeline-improvements]] | `--para:{id}--` markers in editor; chunk/paragraph boundary alignment |
| **E2** | Engine hardening | [[05-plans/engine-refactor]] | Cancel/resume by chunk; draft saves during long translate; document edge cases |

### P1 — UX and reach

| ID | Theme | Plan | Open work (summary) |
|----|-------|------|---------------------|
| **U1** | Reader themes / a11y | [[05-plans/reader-theme-improvements]] | WCAG contrast for `data-reader-theme`; publication vs project defaults |
| **U2** | i18n completeness | [[05-plans/multilingual-ui-audit]] | Grep hardcoded UI strings; parity across en/ru/pl |
| **I1** | SEO operations | [[05-plans/seo-search-console]] | Google Search Console, sitemap submit (tech SEO already in code) |

### P2 — Ops and platform

| ID | Theme | Plan | Open work (summary) |
|----|-------|------|---------------------|
| **O1** | Token limits ops | [[05-plans/tokenization-follow-ups]] | Daily reset cron/RPC; admin unlimited paths |
| **O2** | Production worker | [[_canonical/rules/deployment]] | Document/run BullMQ worker beside Vercel API |

### P3 — Backlog (archive review required)

Do **not** start without triage against `src/`. If still relevant, create a new `05-plans/kebab-name.md`.

| Archive file | Topic |
|--------------|--------|
| `REFACTOR_PLAN.md` | Large cross-cutting refactor |
| `UPLOAD_TRANSLATION_PLAN.md`, `UPLOAD_TRANSLATION_IMPLEMENTATION_PLAN.md` | Upload ready-made translation |
| `ROLES_AND_AUTH_REFACTOR_PLAN.md` | Roles and auth refactor |

Source index: [[_meta/archive-triage]].

### Already done (do not re-open without verification)

- Public catalog / main page plans → CatalogPage implemented
- Glossary merge suggestions → API + UI live
- Icons → policy in `design-system.mdc`
- Core architecture/API docs → superseded by rules + `03-explanation/`

---

## Documentation maintenance (ongoing)

On every meaningful change:

| Change | Update |
|--------|--------|
| New/changed route | [[_canonical/rules/routing]], `AppRouter.tsx`, `server.ts` |
| New convention | Relevant `.mdc` rule |
| New env var | `env.example.txt`, [[_canonical/rules/deployment]] |
| Plan completed | Plan `status: archived`; [[project-status]]; this ROADMAP if priorities shift |
| Logging policy | [[_canonical/rules/logging]] |

Periodically: reconcile [[project-status]] with active P0–P2 rows above.

---

## Suggested execution order

Flexible session order for the next 4–6 weeks:

1. **E1** — Stage 3 para markers (`src/engine/stages/`, engine-integration)
2. **U1** — Reader theme contrast audit (`ReadingMode`, `variables.css`)
3. **E2** — Job cancel/resume verification (`worker.ts`, job endpoints)
4. **U2** — i18n grep and key parity (`src/client/locales/`)
5. **I1** — GSC setup (ops; minimal code)
6. **O1** — Token daily reset verification (Supabase)
7. **P3** — One archive mega-plan per session (triage first)

---

## Links index

| Entry | Path |
|-------|------|
| Vault home | [[Home]] |
| Tactical snapshot | [[project-status]] |
| This roadmap | `docs/ROADMAP.md` |
| Conventions | [[_meta/conventions]] |
| Archive triage | [[_meta/archive-triage]] |
| Active plans | [[05-plans/]] |
| Quick start | [[00-start/quick-start]] |
| Translation debug | [[02-how-to/debug-translation]] |
| Pipeline explainer | [[03-explanation/translation-pipeline]] |
| Agent rules | `.cursor/rules/` (also `docs/_canonical/rules/`) |

---

## Changelog

| Date | Change |
|------|--------|
| 2026-05-16 | Initial roadmap after rules + Obsidian vault + archive triage + 6 active plans |

---

## Кратко (RU)

**ROADMAP** — приоритеты и фазы; **project-status** — что уже есть и текущий backlog. Для AI: `@docs/ROADMAP.md` + `@docs/project-status.md`. Правила и код важнее файлов в `archive/`.
