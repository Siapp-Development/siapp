import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { findForbiddenModules, findMissingLazyTrees } from './check-bundle-isolation.mjs';

const cleanManifest = {
  'apex.html': { file: 'assets/apex-abc.js', isEntry: true },
  'src/surfaces/portal/PortalShell.tsx': {
    file: 'assets/PortalShell-def.js',
    isDynamicEntry: true,
  },
  'src/surfaces/collab/CollabTaskPage.tsx': {
    file: 'assets/CollabTaskPage-ghi.js',
    isDynamicEntry: true,
  },
};

const cleanModules = {
  'assets/apex-abc.js': [
    'src/entries/apex.tsx',
    'src/routes/apexRouter.tsx',
    'src/surfaces/marketing/MarketingHome.tsx',
    '../../node_modules/react/index.js',
  ],
  'assets/PortalShell-def.js': ['src/surfaces/portal/PortalShell.tsx'],
  'assets/CollabTaskPage-ghi.js': ['src/surfaces/collab/CollabTaskPage.tsx'],
};

describe('findForbiddenModules', () => {
  it('passes a clean apex manifest and module map', () => {
    assert.deepEqual(findForbiddenModules(cleanManifest, cleanModules), []);
  });

  it('fails when a firm module id is bundled into a chunk', () => {
    const leaked = {
      ...cleanModules,
      'assets/apex-abc.js': [...cleanModules['assets/apex-abc.js'], 'src/surfaces/firm/FirmShell.tsx'],
    };

    assert.deepEqual(findForbiddenModules(cleanManifest, leaked), [
      'src/surfaces/firm/FirmShell.tsx',
    ]);
  });

  it('fails when an admin module appears as a manifest key', () => {
    const leaked = {
      ...cleanManifest,
      'src/surfaces/admin/AdminShell.tsx': { file: 'assets/AdminShell-x.js', isDynamicEntry: true },
    };

    assert.deepEqual(findForbiddenModules(leaked, cleanModules), [
      'src/surfaces/admin/AdminShell.tsx',
    ]);
  });
});

describe('findMissingLazyTrees', () => {
  it('passes when portal and collab are dynamic entries', () => {
    assert.deepEqual(findMissingLazyTrees(cleanManifest), []);
  });

  it('fails when the portal tree is inlined into the entry chunk', () => {
    const inlined = { 'apex.html': cleanManifest['apex.html'] };

    assert.deepEqual(findMissingLazyTrees(inlined), [
      'portal tree (/p/:token/*)',
      'collab tree (/t/:token)',
    ]);
  });
});
