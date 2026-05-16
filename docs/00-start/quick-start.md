---
type: tutorial
status: active
domain: meta
stale: false
created: 2026-05-16
updated: 2026-05-16
---

# Quick start

## Dev setup

```bash
npm install
cp env.example.txt .env   # add Supabase + OpenAI keys
npm run dev
```

App: `http://localhost:3000`

## Documentation map

1. [[Home]] — vault index
2. [[_canonical/rules/]] — **SSOT** for agents (Cursor rules)
3. [[_meta/conventions]] — when to use rules vs vault

## Before coding

- Read [[_canonical/rules/core]] and [[_canonical/rules/architecture]]
- API work: [[_canonical/rules/api]], [[_canonical/rules/routing]]
- UI work: [[_canonical/rules/client]], [[_canonical/rules/design-system]]
- Engine: [[translation-pipeline]]

## Commands

```bash
npm run lint
npm run typecheck
npm run dev:full    # API + client + worker (async jobs)
```

Legacy deployment guides in `archive/` may be outdated — verify against `env.example.txt` and Vercel config in repo root.
