/**
 * E2E personas — 1:1 with supabase/seed.sql and scripts/local-stack/constants.mjs.
 * Stamp recreates these users on every stack:load / stack:restore.
 */

export const SEED_PASSWORD = 'local-dev-password';

export type PersonaId = 'reader' | 'author' | 'authorPlus' | 'admin';

export type Persona = {
  id: PersonaId;
  email: string;
  role: 'user' | 'author' | 'author_plus' | 'admin';
  userId: string;
};

export const PERSONAS: Record<PersonaId, Persona> = {
  reader: {
    id: 'reader',
    email: 'user@local.test',
    role: 'user',
    userId: '10000000-0000-4000-8000-000000000004',
  },
  author: {
    id: 'author',
    email: 'author@local.test',
    role: 'author',
    userId: '10000000-0000-4000-8000-000000000001',
  },
  authorPlus: {
    id: 'authorPlus',
    email: 'author-plus@local.test',
    role: 'author_plus',
    userId: '10000000-0000-4000-8000-000000000002',
  },
  admin: {
    id: 'admin',
    email: 'admin@local.test',
    role: 'admin',
    userId: '10000000-0000-4000-8000-000000000003',
  },
};

export const AUTHED_PERSONAS = Object.values(PERSONAS);
