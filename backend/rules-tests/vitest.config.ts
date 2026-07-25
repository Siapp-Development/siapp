import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    // Each test file uses its own emulator projectId (see helpers.ts), but the
    // Storage emulator intermittently drops rule evaluations when several
    // storage suites load rulesets concurrently, so files run sequentially.
    fileParallelism: false,
    testTimeout: 15_000,
    hookTimeout: 30_000,
  },
});
