# Arcane Reader

See [AGENTS.md](AGENTS.md) for full agent instructions, team routing, and domain rules.

## Stack

TypeScript (strict), Preact, Express, Supabase (PostgreSQL, Auth, Storage), Redis/BullMQ, Arcane Engine (translation pipeline).

## Commands

```bash
npm run dev               # API + Vite client
npm run dev:full          # + BullMQ worker
npm run lint:all          # lint + typecheck
npm run test              # Vitest unit (pin 4.0.8)
npm run test:component    # Testing Library + happy-dom
npm run test:integration  # mock-integration (createApp + supertest)
npm run test:contract     # Zod contract fixtures
npm run test:coverage     # floors lines 77 / branches 65 (not pre-push)
npm run typecheck
```

Pre-push: `lint:all` + `test` + `test:component` + `test:integration` + `test:contract`.

Testing pyramid: `docs/05-plans/testing-strategy.md`.

## Truth hierarchy

1. `src/` — behavior
2. `.cursor/rules/` — agent policies
3. `docs/` vault — plans and how-to
