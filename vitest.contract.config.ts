import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/contracts/**/*.test.ts', 'tests/contracts/**/*.contract.test.ts'],
    environment: 'node',
    testTimeout: 15_000,
    // Advisory only — primary contract KPI is schema inventory via `npm run test:gaps`.
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'json-summary'],
      reportsDirectory: './coverage-contract',
      include: ['src/api/schemas/**/*.ts', 'src/shared/cacheContract.ts'],
      exclude: ['src/**/*.test.ts', 'src/api/schemas/prompt-lab.ts'],
    },
  },
});
