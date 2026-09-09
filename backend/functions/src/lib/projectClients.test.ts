import { describe, expect, it } from 'vitest';

import {
  resolveProjectClientIds,
  resolveProjectClientNames,
  resolveProjectClients,
} from './projectClients.js';

// #157: the multi-client `clientIds`/`clients` arrays are AUTHORITATIVE by
// presence. A not-yet-backfilled doc (array absent) falls back to the legacy
// single `clientId`/`clientNameDenorm`; once the array is present it wins even
// when empty, so a cleared client list never re-surfaces stale legacy values.
describe('projectClients resolvers', () => {
  describe('resolveProjectClientIds', () => {
    it('returns the clientIds array when present', () => {
      expect(resolveProjectClientIds({ clientIds: ['a', 'b'], clientId: 'legacy' })).toEqual([
        'a',
        'b',
      ]);
    });

    it('is authoritative on a present-but-empty array (no legacy fallback)', () => {
      expect(resolveProjectClientIds({ clientIds: [], clientId: 'legacy' })).toEqual([]);
    });

    it('falls back to legacy clientId only when the array is absent', () => {
      expect(resolveProjectClientIds({ clientId: 'legacy' })).toEqual(['legacy']);
    });

    it('returns [] for an unlinked legacy doc', () => {
      expect(resolveProjectClientIds({ clientId: '' })).toEqual([]);
      expect(resolveProjectClientIds(undefined)).toEqual([]);
    });
  });

  describe('resolveProjectClientNames', () => {
    it('returns the derived names when clients is present', () => {
      expect(
        resolveProjectClientNames({
          clients: [
            { id: 'a', name: 'Ann' },
            { id: 'b', name: 'Ben' },
          ],
          clientNameDenorm: 'Legacy',
        }),
      ).toEqual(['Ann', 'Ben']);
    });

    it('is authoritative on a present-but-empty clients array (no legacy fallback)', () => {
      expect(resolveProjectClientNames({ clients: [], clientNameDenorm: 'Legacy' })).toEqual([]);
    });

    it('falls back to legacy clientNameDenorm only when clients is absent', () => {
      expect(resolveProjectClientNames({ clientNameDenorm: 'Legacy' })).toEqual(['Legacy']);
    });
  });

  describe('resolveProjectClients', () => {
    it('returns aligned {id,name} refs when clients is present', () => {
      expect(
        resolveProjectClients({
          clients: [{ id: 'a', name: 'Ann' }],
          clientId: 'legacy',
          clientNameDenorm: 'Legacy',
        }),
      ).toEqual([{ id: 'a', name: 'Ann' }]);
    });

    it('is authoritative on a present-but-empty clients array (no legacy fallback)', () => {
      expect(
        resolveProjectClients({ clients: [], clientId: 'legacy', clientNameDenorm: 'Legacy' }),
      ).toEqual([]);
    });

    it('falls back to the legacy single client only when clients is absent', () => {
      expect(resolveProjectClients({ clientId: 'legacy', clientNameDenorm: 'Legacy' })).toEqual([
        { id: 'legacy', name: 'Legacy' },
      ]);
    });

    it('skips malformed entries (missing/blank id) inside a present array', () => {
      expect(
        resolveProjectClients({
          clients: [{ id: '', name: 'x' }, { name: 'y' }, { id: 'z', name: 'Zed' }],
        }),
      ).toEqual([{ id: 'z', name: 'Zed' }]);
    });
  });
});
