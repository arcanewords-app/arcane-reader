/**
 * Resolve vitest.mjs for workspace (hoisted) and nested installs.
 * Also normalize the project root to Windows native drive casing so Vitest
 * workers do not hit "No test suite found" (f: vs F:).
 */
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { existsSync, realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chdir } from 'node:process';

const packageRoot = join(fileURLToPath(new URL('..', import.meta.url)));

/** Prefer native realpath so Windows drive letters match Vitest worker paths. */
export function resolveProjectRoot() {
  try {
    return typeof realpathSync.native === 'function'
      ? realpathSync.native(packageRoot)
      : realpathSync(packageRoot);
  } catch {
    return packageRoot;
  }
}

export function ensureNativeCwd(root = resolveProjectRoot()) {
  if (process.cwd() !== root) {
    chdir(root);
  }
  return root;
}

export function resolveVitestBin(root = resolveProjectRoot()) {
  const nested = join(root, 'node_modules/vitest/vitest.mjs');
  if (existsSync(nested)) return nested;

  const require = createRequire(join(root, 'package.json'));
  try {
    const pkg = require.resolve('vitest/package.json');
    return join(dirname(pkg), 'vitest.mjs');
  } catch {
    throw new Error('vitest not found. Run npm install from the monorepo root (or this package).');
  }
}
