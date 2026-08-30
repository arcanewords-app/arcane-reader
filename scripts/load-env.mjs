/**
 * Load gitignored env files. `.env.local` wins over `.env` for the same key.
 * Keep path order in sync with `src/loadEnv.ts`.
 */
import { resolve } from 'node:path';
import { config } from 'dotenv';

export function loadProjectEnv(cwd = process.cwd()) {
  return config({
    path: [resolve(cwd, '.env.local'), resolve(cwd, '.env')],
  });
}
