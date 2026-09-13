import path from 'path';
import { configDefaults, defineConfig } from 'vitest/config';

/** Same Preact/React aliases as vitest.config.ts — keep in sync. */
export default defineConfig({
  esbuild: {
    jsx: 'automatic',
    jsxImportSource: 'preact',
  },
  test: {
    include: ['src/**/*.test.tsx', 'src/client/**/*.hook.test.ts'],
    exclude: [
      ...configDefaults.exclude,
      '**/dist/**',
      '**/coverage/**',
      '**/coverage-component/**',
      'tests/e2e/**',
    ],
    environment: 'happy-dom',
    // Vitest 5 default is forks. `threads` + Node fetch / worker crash hangs the run
    // (vitest#3077, docs “Failed to Terminate Worker”). Keep maxWorkers: 2 like unit.
    pool: 'forks',
    maxWorkers: 2,
    setupFiles: ['src/test/setup-component.ts'],
    testTimeout: 15_000,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'json-summary'],
      reportsDirectory: './coverage-component',
      // CLIENT_SCOPE — component/hook/page UI only; not merged with unit APP_SCOPE.
      include: [
        'src/client/components/**/*.{ts,tsx}',
        'src/client/pages/**/*.{ts,tsx}',
        'src/client/hooks/**/*.{ts,tsx}',
      ],
      exclude: [
        'src/**/*.test.ts',
        'src/**/*.test.tsx',
        'src/**/*.hook.test.ts',
        '**/index.ts',
        'src/debug-app/**',
        'src/prompt-lab-app/**',
      ],
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
