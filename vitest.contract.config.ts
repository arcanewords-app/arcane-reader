import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/contracts/**/*.test.ts', 'tests/contracts/**/*.contract.test.ts'],
    environment: 'node',
    testTimeout: 15_000,
  },
});
