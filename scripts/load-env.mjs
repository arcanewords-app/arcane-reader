/**
 * Load gitignored env files for stack/scripts. Always local: `.env.local` then `.env`.
 * API/worker prod overlay is `ARCANE_DB=prod` in `src/loadEnv.ts` (npm run dev:full:prod).
 */
import { resolve } from 'node:path';
import { config } from 'dotenv';

export function loadProjectEnv(cwd = process.cwd()) {
  return config({
    path: [resolve(cwd, '.env.local'), resolve(cwd, '.env')],
  });
}
