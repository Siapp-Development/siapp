/// <reference types="vitest/config" />
import { existsSync, mkdirSync, renameSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vite';

const SURFACES = ['apex', 'dashboard', 'admin'] as const;
type TSurface = (typeof SURFACES)[number];

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

export default defineConfig(({ mode }) => {
  // vitest and plain `vite build` run without a surface mode; default to apex.
  const surface: TSurface = isSurface(mode) ? mode : 'apex';

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
