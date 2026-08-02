import path from 'path';
import { defineConfig } from 'vitest/config';

/** Tiktoken-heavy preview tests — run via `npm run test:slow`. */
const SLOW_TEST_FILES = [
  'src/engine/translate-execution-preview.test.ts',
  'src/engine/translate-chunking-policy.test.ts',
  'src/engine/edit-execution-preview.test.ts',
];

const isCoverageRun = process.argv.includes('--coverage');

export default defineConfig({
  esbuild: {
    jsx: 'automatic',
    jsxImportSource: 'preact',
  },
  test: {
    // Unit gate: pure/node tests. Component suites run via test:component.
    include: ['src/**/*.test.ts'],
    exclude: [
      '**/node_modules/**',
      'src/**/*.test.tsx',
      'src/**/*.hook.test.ts',
      ...SLOW_TEST_FILES,
    ],
    environment: 'node',
    testTimeout: isCoverageRun ? 120_000 : 10_000,
    // Windows + Node 24: unbounded forks can hit "Timeout starting forks runner".
    pool: 'forks',
    maxWorkers: 2,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'json-summary'],
      reportsDirectory: './coverage',
      include: ['src/**/*.ts'],
      exclude: [
        'src/**/*.test.ts',
        'src/**/*.test.tsx',
        'src/**/*.hook.test.ts',
        'src/debug-app/**',
        'src/prompt-lab-app/**',
        'src/debug/**',
        'src/prompt-lab/**',
      ],
      // Floors from measured APP_SCOPE (unit suite). Not enforced in pre-push.
      // Raise deliberately with coverage gains; never silent lower.
      // Coverage campaign Phases A–C (2026-08-02); soft ceiling ~78% without binary parsers.
      thresholds: {
        lines: 77,
        branches: 65,
      },
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src/client'),
      react: 'preact/compat',
      'react-dom': 'preact/compat',
      'react/jsx-runtime': 'preact/jsx-runtime',
      'react/jsx-dev-runtime': 'preact/jsx-dev-runtime',
    },
  },
});

