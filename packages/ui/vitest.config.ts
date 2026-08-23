import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

/**
 * Minimal Vitest setup for the shared design system (#104). Kept consistent
 * with apps/web: jsdom environment, a small setup file, and globals disabled
 * (tests import `describe`/`it`/`expect` from 'vitest' explicitly). Lets the
 * Avatar component and avatarColor util be unit-tested where they live.
 */
export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/vitest.setup.ts'],
  },
});
