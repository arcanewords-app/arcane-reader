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
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
    testTimeout: isCoverageRun ? 120_000 : 10_000,
    exclude: ['**/node_modules/**', ...SLOW_TEST_FILES],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'json-summary'],
      reportsDirectory: './coverage',
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.test.ts', 'src/debug-app/**', 'src/prompt-lab-app/**'],
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src/client'),
    },
  },
});
