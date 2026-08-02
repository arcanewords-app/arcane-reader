import path from 'path';
import { fileURLToPath } from 'url';
import { defineConfig } from 'vitest/config';

const root = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  test: {
    include: ['tests/integration/**/*.test.ts'],
    exclude: ['**/node_modules/**', 'tests/integration/supabase/**'],
    environment: 'node',
    // Env isolation: tests/integration/setup.ts (imported by createTestApp / worker tests).
    testTimeout: 90_000,
    hookTimeout: 120_000,
    pool: 'forks',
    isolate: true,
    fileParallelism: true,
    maxWorkers: 2,
  },
  resolve: {
    alias: {
      '@': path.resolve(root, './src/client'),
      react: 'preact/compat',
      'react-dom': 'preact/compat',
      'react/jsx-runtime': 'preact/jsx-runtime',
      'react/jsx-dev-runtime': 'preact/jsx-dev-runtime',
    },
  },
});
