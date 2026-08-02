import path from 'path';
import { defineConfig } from 'vitest/config';

/** Same Preact/React aliases as vitest.config.ts — keep in sync. */
export default defineConfig({
  esbuild: {
    jsx: 'automatic',
    jsxImportSource: 'preact',
  },
  test: {
    include: ['src/**/*.test.tsx', 'src/client/**/*.hook.test.ts'],
    environment: 'happy-dom',
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
