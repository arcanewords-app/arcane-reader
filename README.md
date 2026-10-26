# Arcane Reader

[![License: AGPL-3.0-or-later](https://img.shields.io/badge/License-AGPL--3.0--or--later-blue.svg)](https://www.gnu.org/licenses/agpl-3.0)

Web UI for Arcane novel translator. AI-powered translation pipeline for fiction (EN → RU focus) with glossary, style analysis, and special text block formatting.

## Features

- 3-stage translation pipeline: Analyze → Translate → Edit
- Glossary management (characters, locations, terms)
- **Text Blocks** — special formatting for system messages, notes, letters, skills, inner voice
- Reading mode with customizable typography
- EPUB export

## Text Blocks — Format for Integration

If you bring a translation that already contains special formatting, use **markers** (not HTML):

```
{{block:type-id}}text{{/block:type-id}}
```

### Supported types

| Type ID        | Description                          |
| -------------- | ------------------------------------ |
| system-message | Game stats, level-ups, notifications |
| note           | Letters, notes, book excerpts        |
| notification   | Inline tooltips, hints               |
| skill          | Skill/spell names (inline)           |
| inner-voice    | Character's thoughts                 |

### Examples

```
{{block:system-message}}Level Up! Сила +5. Новый навык: Удар молнии{{/block:system-message}}
```

```
{{block:note}}Дорогой друг, надеюсь это письмо застанет тебя в добром здравии...{{/block:note}}
```

```
Маг призвал {{block:skill}}Огненный шар{{/block:skill}}, который устремился к врагу.
```

**Note:** HTML tags (`<aside>`, `<section>`, etc.) are not supported — use markers only.

## Tech Stack

- **Frontend:** Preact, Vite, i18next (devDependencies — bundled at build)
- **Backend:** Express, Supabase
- **AI:** OpenAI
- **Sanitization:** DOMPurify (client bundle)

## Documentation

- **Roadmap (priorities):** [docs/ROADMAP.md](docs/ROADMAP.md)
- **Project status (snapshot):** [docs/project-status.md](docs/project-status.md)
- **Agent / conventions (SSOT):** [`.cursor/rules/`](.cursor/rules/) — start with `architecture.mdc`, `routing.mdc`
- **Obsidian vault:** [docs/Home.md](docs/Home.md) — plans, ADR, onboarding
- **Routes:** [`.cursor/rules/routing.mdc`](.cursor/rules/routing.mdc) (canonical); [docs/ROUTES.md](docs/ROUTES.md) is a stub
- Legacy notes: [docs/archive/](docs/archive/) — may be outdated

## Development

```bash
npm install
npm run dev
```

## License

Releases from this change onward are free software under the [GNU Affero General Public License v3.0 or later](LICENSE) (`AGPL-3.0-or-later`).

Revisions published before this change stay under the MIT License. That grant is not revoked.

If you run a modified version as a network service, section 13 of the AGPL requires you to offer users who interact with it remotely the corresponding source of that version. The public git repository is the source for the published tree: <https://github.com/arcanewords-app/arcane-reader>.
