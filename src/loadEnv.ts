/**
 * Load gitignored env files. `.env.local` wins over `.env` for the same key
 * (dotenv first-file-wins; Vite loads `.env` then `.env.local` — same result).
 * `ARCANE_DB=prod` also loads `.env.prod.local` first (npm run dev:full:prod).
 * Keep path order in sync with `scripts/load-env.mjs` for the local target.
 */
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { config } from 'dotenv';
import {
  isLocalSupabaseUrl,
  parseDevDatabaseTarget,
  supabaseHostLabel,
} from './shared/devDatabaseTarget.js';

const skipDbGuard =
  Boolean(process.env.VERCEL) ||
  process.env.VITEST === 'true' ||
  process.env.NODE_ENV === 'test' ||
  process.env.DOTENV_CONFIG_QUIET === 'true';
const quiet = skipDbGuard;

const target = skipDbGuard ? 'local' : parseDevDatabaseTarget(process.env.ARCANE_DB);
const cwd = process.cwd();

if (target === 'prod' && !existsSync(resolve(cwd, '.env.prod.local'))) {
  console.error(
    'Missing .env.prod.local. Put prod SUPABASE_URL / ANON / SERVICE_ROLE there, then npm run dev:full:prod.'
  );
  process.exit(1);
}

if (target === 'prod') {
  config({
    path: resolve(cwd, '.env.prod.local'),
    quiet,
    override: true,
  });
}

config({
  path: [resolve(cwd, '.env.local'), resolve(cwd, '.env')],
  quiet,
});

if (!skipDbGuard) {
  const url = process.env.SUPABASE_URL;
  if (target === 'local' && url && !isLocalSupabaseUrl(url)) {
    console.error(
      '[arcane] Refusing to start: SUPABASE_URL is cloud while ARCANE_DB is local.\n' +
        'Move cloud keys to .env.prod.local and use npm run dev:full:prod.'
    );
    process.exit(1);
  }
  if (target === 'prod' && isLocalSupabaseUrl(url)) {
    console.error(
      '[arcane] ARCANE_DB=prod but SUPABASE_URL is localhost. Check .env.prod.local.'
    );
    process.exit(1);
  }
  const host = supabaseHostLabel(url);
  if (target === 'prod') {
    console.warn(`[arcane] Database: PROD ${host} — writes go to live data`);
  } else {
    console.log(`[arcane] Database: local ${host}`);
  }
}
