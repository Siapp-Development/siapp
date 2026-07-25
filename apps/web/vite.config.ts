/// <reference types="vitest/config" />
import { existsSync, mkdirSync, renameSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv, type Plugin } from 'vite';

const SURFACES = ['apex', 'dashboard', 'admin'] as const;
type TSurface = (typeof SURFACES)[number];

/**
 * Firebase env vars that must be baked into every production bundle. Vite
 * inlines them at build time, so a build without them ships a bundle that
 * throws FirebaseConfigError on load. The committed apps/web/.env provides
 * them; this guard fails the build loudly if that file goes missing.
 */
const REQUIRED_FIREBASE_ENV_KEYS = [
  'VITE_FIREBASE_API_KEY',
  'VITE_FIREBASE_AUTH_DOMAIN',
  'VITE_FIREBASE_PROJECT_ID',
  'VITE_FIREBASE_STORAGE_BUCKET',
  'VITE_FIREBASE_MESSAGING_SENDER_ID',
  'VITE_FIREBASE_APP_ID',
  // impl-28: marketing CTAs link to the external Typeform; a bundle built
  // without it would ship dead "Request early access" buttons.
  'VITE_EARLY_ACCESS_FORM_URL',
] as const;

function assertFirebaseEnv(env: Record<string, string>): void {
  const missing = REQUIRED_FIREBASE_ENV_KEYS.filter((key) => !env[key]);
  if (missing.length > 0) {
    throw new Error(
      `Refusing to build without Firebase config. Missing: ${missing.join(', ')}. ` +
        'These should come from the committed apps/web/.env file.',
    );
  }
}

function isSurface(mode: string): mode is TSurface {
  return (SURFACES as readonly string[]).includes(mode);
}

/**
 * Per-surface build plumbing (D-036):
 * - dev: rewrite SPA routes to the surface's HTML entry;
 * - build: rename `<surface>.html` -> `index.html` for Firebase Hosting, and
 *   emit `.vite/modules.json` (chunk -> bundled module ids) so
 *   scripts/check-bundle-isolation.mjs can assert firm/admin code is
 *   physically absent from the apex artifact. The standard Vite manifest
 *   only lists entry/dynamic-entry chunks, so it cannot see statically
 *   merged modules on its own.
 */
function surfaceEntry(surface: TSurface): Plugin {
  const chunkModules: Record<string, string[]> = {};
  let outDir = '';
  let root = '';

  return {
    name: 'siapp:surface-entry',
    configResolved(config) {
      root = config.root;
      outDir = path.resolve(config.root, config.build.outDir);
    },
    configureServer(server) {
      server.middlewares.use((req, _res, next) => {
        const url = req.url ?? '/';
        if (req.method === 'GET' && !url.includes('.') && !url.startsWith('/@')) {
          req.url = `/${surface}.html`;
        }
        next();
      });
    },
    generateBundle(_options, bundle) {
      for (const output of Object.values(bundle)) {
        if (output.type === 'chunk') {
          chunkModules[output.fileName] = output.moduleIds.map((id) => path.relative(root, id));
        }
      }
    },
    writeBundle() {
      const emittedHtml = path.join(outDir, `${surface}.html`);
      if (existsSync(emittedHtml)) {
        renameSync(emittedHtml, path.join(outDir, 'index.html'));
      }
      const viteDir = path.join(outDir, '.vite');
      mkdirSync(viteDir, { recursive: true });
      writeFileSync(path.join(viteDir, 'modules.json'), JSON.stringify(chunkModules, null, 2));
    },
  };
}

export default defineConfig(({ mode, command }) => {
  // vitest and plain `vite build` run without a surface mode; default to apex.
  const surface: TSurface = isSurface(mode) ? mode : 'apex';

  if (command === 'build') {
    assertFirebaseEnv(loadEnv(mode, fileURLToPath(new URL('.', import.meta.url)), 'VITE_'));
  }

  return {
    plugins: [react(), tailwindcss(), surfaceEntry(surface)],
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url)),
      },
    },
    build: {
      outDir: `dist/${surface}`,
      emptyOutDir: true,
      manifest: true,
      rollupOptions: {
        input: fileURLToPath(new URL(`./${surface}.html`, import.meta.url)),
      },
    },
    test: {
      environment: 'jsdom',
      setupFiles: ['./src/vitest.setup.ts'],
    },
  };
});
