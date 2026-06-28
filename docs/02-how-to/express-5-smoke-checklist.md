# Express 5 post-migration smoke checklist

Manual verification after Express 5 + router extraction. Run on local `npm run dev:full` or Vercel preview.

## Auth

- [ ] POST `/api/auth/register` (validation error + success path)
- [ ] POST `/api/auth/login` → session tokens
- [ ] GET `/api/auth/me` with Bearer token

## Upload (multer)

- [ ] Chapter import (`.txt` / `.epub` / `.fb2`)
- [ ] Glossary CSV upload
- [ ] Profile avatar upload
- [ ] Publication cover / entity photo upload
- [ ] MulterError: file over size limit → 400/413

## SSR / SPA

- [ ] GET `/p/:publicationId` — crawler HTML meta
- [ ] GET `/p/:id/chapters/:cid/reading` — reading SSR
- [ ] SPA deep link e.g. `/projects` via `/{*splat}` fallback
- [ ] Static SEO pages `/`, `/catalog`, `/news/:slugOrId`

## Prompt Lab / Debug (dev only)

- [ ] Prompt Lab upload + CRUD routes
- [ ] `/api/debug/query` (local)

## Deploy

- [ ] Vercel preview: `api/index.ts` handler, Node 24
