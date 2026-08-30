/**
 * Load gitignored env files. `.env.local` wins over `.env` for the same key
 * (dotenv first-file-wins; Vite loads `.env` then `.env.local` — same result).
 * Keep path order in sync with `scripts/load-env.mjs`.
 */
import { resolve } from 'node:path';
import { config } from 'dotenv';

const quiet =
  Boolean(process.env.VERCEL) ||
  process.env.VITEST === 'true' ||
  process.env.NODE_ENV === 'test' ||
  process.env.DOTENV_CONFIG_QUIET === 'true';

config({
  path: [resolve(process.cwd(), '.env.local'), resolve(process.cwd(), '.env')],
  quiet,
});
