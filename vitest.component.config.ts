import path from 'path';
import { defineConfig } from 'vitest/config';

/** Same Preact/React aliases as vitest.config.ts — keep in sync. */
export default defineConfig({
  test: {
    include: ['src/**/*.test.tsx', 'src/client/**/*.hook.test.ts'],
    environment: 'happy-dom',
    setupFiles: ['src/test/setup-component.ts'],
    testTimeout: 15_000,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src/client'),
      react: 'preact/compat',
      'react-dom': 'preact/compat',
      'react/jsx-runtime': 'preact/jsx-runtime',
      'react/jsx-dev-runtime': 'preact/compat/jsx-dev-runtime',
    },
  },
});
