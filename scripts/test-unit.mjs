/**
 * Unit gate wrapper: native cwd casing + local/hoisted vitest binary.
 * Avoids Windows "No test suite found" from f: vs F: mismatch (cwd casing).
 * Keep until Vitest 5 glob/dir + native cwd is proven on Windows + Node 24.
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
