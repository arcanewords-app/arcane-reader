/**
 * Set ARCANE_DB and run an npm script (Windows-safe; no cross-env).
 *
 *   node scripts/with-db-target.mjs prod dev:full
 */
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

const target = process.argv[2];
const npmScript = process.argv[3];

if ((target !== 'local' && target !== 'prod') || !npmScript) {
  console.error('Usage: node scripts/with-db-target.mjs <local|prod> <npm-script>');
  process.exit(1);
}

if (target === 'prod') {
  const file = resolve(process.cwd(), '.env.prod.local');
  if (!existsSync(file)) {
    console.error(
      'Missing .env.prod.local (SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY). See env.example.txt.'
    );
    process.exit(1);
  }
}

process.env.ARCANE_DB = target;
const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const child = spawn(npmCmd, ['run', npmScript], {
  stdio: 'inherit',
  env: process.env,
  shell: process.platform === 'win32',
});
child.on('exit', (code, signal) => {
  if (signal) process.exit(1);
  process.exit(code ?? 1);
});
