/**
 * Run mock-integration suite by enumerating test files.
 * Vitest 4.0.8 on Windows flaky-fails with "No test suite found" when the
 * entry is a directory/glob; explicit file list is stable.
 */
import { readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { spawnSync } from 'node:child_process';
import { ensureNativeCwd, resolveVitestBin } from './resolve-vitest.mjs';

const root = ensureNativeCwd();
const integrationRoot = join(root, 'tests', 'integration');

function collectTests(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) {
      if (name === 'supabase') continue;
      collectTests(full, out);
      continue;
    }
    if (name.endsWith('.test.ts')) out.push(relative(root, full).replace(/\\/g, '/'));
  }
  return out;
}

const files = collectTests(integrationRoot).sort();
if (files.length === 0) {
  console.error('No integration tests found under tests/integration');
  process.exit(1);
}

const result = spawnSync(
  process.execPath,
  [resolveVitestBin(root), 'run', '--config', 'vitest.integration.config.ts', ...files],
  { cwd: root, stdio: 'inherit' }
);

process.exit(result.status ?? 1);
