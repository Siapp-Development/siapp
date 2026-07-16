#!/usr/bin/env node
/**
 * D-036 bundle-isolation check — the non-honor-system half of the guarantee
 * (the ESLint no-restricted-paths zones are the dev-time half).
 *
 * Reads the apex build's Vite manifest (dist/apex/.vite/manifest.json) and
 * the module map emitted by the siapp:surface-entry plugin
 * (dist/apex/.vite/modules.json) and fails if:
 *   1. any firm/admin module is present anywhere in the apex graph, or
 *   2. the /p (portal) and /t (collab) trees are not separate lazy chunks.
 *
 * modules.json is needed because the standard manifest only lists entry and
 * dynamic-entry chunks — a statically merged firm module would be invisible
 * in manifest.json alone.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

const FORBIDDEN_MODULE = /src\/surfaces\/(firm|admin)\//;
const PORTAL_TREE = /src\/surfaces\/portal\//;
const COLLAB_TREE = /src\/surfaces\/collab\//;

/**
 * Returns every module id from the manifest keys or the chunk module map
 * that belongs to the firm or admin surface. Must be empty for apex.
 */
export function findForbiddenModules(manifest, modulesByChunk) {
  const hits = new Set();

  for (const key of Object.keys(manifest)) {
    if (FORBIDDEN_MODULE.test(key)) {
      hits.add(key);
    }
  }

  for (const moduleIds of Object.values(modulesByChunk)) {
    for (const id of moduleIds) {
      if (FORBIDDEN_MODULE.test(id)) {
        hits.add(id);
      }
    }
  }

  return [...hits].sort();
}

/**
 * Asserts /p and /t route trees exist as *separate lazy chunks* (dynamic
 * entries in the manifest). If either tree were statically inlined into the
 * apex entry chunk it would not appear as a dynamic entry.
 */
export function findMissingLazyTrees(manifest) {
  const missing = [];
  const hasDynamicEntry = (pattern) =>
    Object.entries(manifest).some(
      ([key, chunk]) => pattern.test(key) && chunk.isDynamicEntry === true,
    );

  if (!hasDynamicEntry(PORTAL_TREE)) {
    missing.push('portal tree (/p/:token/*)');
  }
  if (!hasDynamicEntry(COLLAB_TREE)) {
    missing.push('collab tree (/t/:token)');
  }

  return missing;
}

function main() {
  const apexViteDir = path.resolve(process.cwd(), 'apps/web/dist/apex/.vite');
  const manifest = JSON.parse(readFileSync(path.join(apexViteDir, 'manifest.json'), 'utf8'));
  const modulesByChunk = JSON.parse(readFileSync(path.join(apexViteDir, 'modules.json'), 'utf8'));

  const forbidden = findForbiddenModules(manifest, modulesByChunk);
  const missingLazy = findMissingLazyTrees(manifest);
  let failed = false;

  if (forbidden.length > 0) {
    failed = true;
    console.error('✖ Firm/admin modules leaked into the apex bundle:');
    for (const id of forbidden) {
      console.error(`  - ${id}`);
    }
  }

  if (missingLazy.length > 0) {
    failed = true;
    console.error('✖ External trees are not split into separate lazy chunks:');
    for (const tree of missingLazy) {
      console.error(`  - ${tree}`);
    }
  }

  if (failed) {
    process.exit(1);
  }

  console.log('✓ Apex bundle is isolated: no firm/admin modules; /p and /t are lazy chunks.');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
