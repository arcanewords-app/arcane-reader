# Arcane Reader

See [AGENTS.md](AGENTS.md) for full agent instructions, team routing, and domain rules.

## Stack

TypeScript (strict), Preact, Express, Supabase (PostgreSQL, Auth, Storage), Redis/BullMQ, Arcane Engine (translation pipeline).

## Commands

```bash
npm run dev          # API + Vite client
npm run dev:full     # + BullMQ worker
npm run lint:all     # lint + typecheck
npm run test         # Vitest unit tests
npm run typecheck
```

## Truth hierarchy

1. `src/` — behavior
2. `.cursor/rules/` — agent policies
3. `docs/` vault — plans and how-to
