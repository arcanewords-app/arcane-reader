/**
 * Run component suite by enumerating test files.
 * Vitest 4.0.8 on Windows can fail setupFiles + directory/glob entry with
 * "failed to find the runner" / "No test suite found"; explicit files are stable.
 *
 * Extra args (e.g. `--coverage`) are forwarded to Vitest.
 */
import { readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { spawnSync } from 'node:child_process';
import { ensureNativeCwd, resolveVitestBin } from './resolve-vitest.mjs';

const root = ensureNativeCwd();
const extraArgs = process.argv.slice(2);

function collect(dir, pred, out = []) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) {
      if (name === 'node_modules' || name === 'dist') continue;
      collect(full, pred, out);
      continue;
    }
    if (pred(name, full)) out.push(relative(root, full).replace(/\\/g, '/'));
  }
  return out;
}

const files = [
  ...collect(join(root, 'src'), (name) => name.endsWith('.test.tsx')),
  ...collect(join(root, 'src', 'client'), (name) => name.endsWith('.hook.test.ts')),
].sort();

if (files.length === 0) {
  console.error('No component tests found');
  process.exit(1);
}

const result = spawnSync(
  process.execPath,
  [resolveVitestBin(root), 'run', '--config', 'vitest.component.config.ts', ...extraArgs, ...files],
  { cwd: root, stdio: 'inherit' }
);

process.exit(result.status ?? 1);
