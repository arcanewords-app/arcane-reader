import path from 'path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: [
      'src/engine/translate-execution-preview.test.ts',
      'src/engine/translate-chunking-policy.test.ts',
      'src/engine/edit-execution-preview.test.ts',
    ],
    environment: 'node',
    testTimeout: 120_000,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src/client'),
    },
  },
});
