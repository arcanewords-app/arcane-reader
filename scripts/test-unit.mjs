/**
 * Unit gate wrapper: native cwd casing + local/hoisted vitest binary.
 * Avoids Windows Vitest 4.0.8 "No test suite found" from f: vs F: mismatch.
 */
import { spawnSync } from 'node:child_process';
import { ensureNativeCwd, resolveVitestBin } from './resolve-vitest.mjs';

const root = ensureNativeCwd();
const extraArgs = process.argv.slice(2);

const result = spawnSync(process.execPath, [resolveVitestBin(root), 'run', ...extraArgs], {
  cwd: root,
  stdio: 'inherit',
});

process.exit(result.status ?? 1);
