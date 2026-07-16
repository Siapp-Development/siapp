import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    // Each test file uses its own emulator projectId (see helpers.ts), so
    // files can run in parallel without clobbering each other's seed data.
    testTimeout: 15_000,
    hookTimeout: 30_000,
  },
});
