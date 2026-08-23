import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

// RTL auto-cleanup relies on a global afterEach, which is not exposed when
// vitest runs with globals disabled — register it explicitly.
afterEach(() => {
  cleanup();
});
