---
name: license
description: AGPL-3.0-or-later obligations for Arcane Reader — new files, dependency SPDX checks, and the network source offer. Use when adding source files, adding npm packages, changing LICENSE, or publishing a hosted build.
---

# License

Policy SSOT: `@.cursor/rules/license.mdc`. This skill is the checklist when the license is in scope.

## Project grant

- Current releases: `AGPL-3.0-or-later`, copyright Ilya Murashka (`LICENSE`, `package.json`).
- Older revisions already published under MIT remain under MIT. Do not revoke that grant or rewrite those commits.

## New source file

Put the header from `license.mdc` on new files under `src/`, `tests/`, and `scripts/`. Do not add it to generated output, snapshots, or third-party trees. Do not bulk-insert headers into existing files.

## New dependency

1. Read `license` on the lockfile entry `node_modules/<name>`.
2. Allow MIT, BSD-2-Clause, BSD-3-Clause, ISC, Apache-2.0, and LGPL as a library. Leave the dependency on its own license.
3. If the license is GPL-2.0-only, Commons Clause, BUSL, SSPL, proprietary, or non-commercial, stop and ask. Do not substitute another package to avoid the question.
4. Production dependencies are what gets conveyed with the app. Dev-only tools are outside the AGPL work, but prefer the same compatible set.

Checked at the license change: production dependencies were MIT, BSD-2-Clause, ISC, or Apache-2.0.

## Hosted modified version

Users who interact with a modified build over the network need a no-charge offer of that version's corresponding source (AGPL §13).

- UI links: header info menu (`info.source`) and `/about` (`about.sourceLink`).
- URL: `https://github.com/arcanewords-app/arcane-reader`.
- The public tree must match the deployed commit. Do not ship private patches of this code.
- Do not propose a closed fork as a way around §13.

## Do not

- Edit the GNU AGPL text inside `LICENSE`. Copyright and the "or later" grant stay in the notice above that text.
- Relicense snippets of this repo to MIT when pasting them elsewhere.
- Strip copyright lines from files you touch.
