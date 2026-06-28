---
name: api-agent
description: Express API patterns for Arcane Reader — Zod, auth, 503, routing SSOT. Use when acting as API Agent or editing server routes and middleware.
---

# API Agent Skill

## When To Use

- Adding or changing handlers in `src/server.ts`
- Middleware: auth, logging, service health
- Zod schemas in `src/api/schemas/`
- Updating the canonical route map
- Security-sensitive routes (ownership, roles, admin) — also read `@.cursor/skills/security/SKILL.md`

## Domain Knowledge

- **Validation:** `validateParams` / `validateQuery` from `@src/api/validateRoute.ts` for path and query; `schema.safeParse(req.body)` for body; 400 + `flatten().fieldErrors`
- **Auth:** Bearer JWT; `requireAuth`, `optionalAuth`, `requireRole('author' | 'admin' | …)`
- **503:** `handleServiceError` must be first in catch for Supabase/Redis failures
- **Cache:** `withRedisCache` on read-heavy GETs; invalidate on writes per `cache.mdc`
- **Routes SSOT:** `.cursor/rules/routing.mdc` — not `docs/ROUTES.md` alone

## Patterns

```typescript
import { validateParams, parseQuery } from '../api/validateRoute.js';
import { projectIdParamSchema } from '../api/routeParams.js';

app.get(
  '/api/projects/:id',
  requireAuth,
  validateParams(projectIdParamSchema),
  async (req, res) => {
    const { id } = req.validatedParams as { id: string };
    // ...
  }
);

// Or inline query parse (Express 5-safe):
const query = parseQuery(myQuerySchema, req, res);
if (!query) return;
```

```typescript
const parsed = mySchema.safeParse(req.body);
if (!parsed.success) {
  return res.status(400).json({
    error: 'Validation failed',
    details: parsed.error.flatten().fieldErrors,
  });
}

try {
  // ...
} catch (error) {
  if (handleServiceError(error, req, res)) return;
  req.log.error({ err: error }, 'Operation failed');
  res.status(500).json({ error: '...' });
}
```

- Log with `req.log` (English, structured `event` fields)
- Delegate persistence to `supabaseDatabase.ts` / services — keep handlers thin

## Anti-patterns

- Skipping Zod on new body/query/**path** parameters
- Raw `req.params.id` without `validateParams` or `requireRouteParam` (Express 5 migration)
- 500 for Supabase/Redis outages (use 503 via `handleServiceError`)
- Forgetting `routing.mdc` when adding/removing paths
- Business logic bloating route handlers (move to services)
- Logging tokens, API keys, or full PII bodies
- Missing ownership checks on user-supplied object ids (BOLA) — see `@.cursor/skills/security/SKILL.md`

## Planned extensions

_Add: per-domain schema cheat sheet, cache invalidation matrix per route type._
