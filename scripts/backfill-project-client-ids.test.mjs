/**
 * Pure-logic tests for the #157 project clientIds/clients backfill — the
 * derivation from the legacy single client fields and the idempotency guard.
 *
 * Uses the node:test runner (matching the other scripts/*.test.mjs), so this
 * runs under `pnpm test` (root package.json wires it in via `node --test`).
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { clientFieldsFromLegacy, isBackfilled } from './backfill-project-client-ids.mjs';

describe('clientFieldsFromLegacy', () => {
  it('projects the legacy single client into paired arrays', () => {
    assert.deepEqual(clientFieldsFromLegacy({ clientId: 'c1', clientNameDenorm: 'Ann Lee' }), {
      clientIds: ['c1'],
      clients: [{ id: 'c1', name: 'Ann Lee' }],
    });
  });

  it('preserves a missing name as an empty string', () => {
    assert.deepEqual(clientFieldsFromLegacy({ clientId: 'c1' }), {
      clientIds: ['c1'],
      clients: [{ id: 'c1', name: '' }],
    });
  });

  it('yields empty arrays for an unlinked / malformed project', () => {
    assert.deepEqual(clientFieldsFromLegacy({ clientId: '' }), { clientIds: [], clients: [] });
    assert.deepEqual(clientFieldsFromLegacy({}), { clientIds: [], clients: [] });
    assert.deepEqual(clientFieldsFromLegacy(undefined), { clientIds: [], clients: [] });
    assert.deepEqual(clientFieldsFromLegacy({ clientId: 42 }), { clientIds: [], clients: [] });
  });
});

describe('isBackfilled', () => {
  it('true only when a clientIds array is already present (idempotent skip)', () => {
    assert.equal(isBackfilled({ clientIds: [] }), true);
    assert.equal(isBackfilled({ clientIds: ['c1'] }), true);
    assert.equal(isBackfilled({ clientId: 'c1' }), false);
    assert.equal(isBackfilled({}), false);
    assert.equal(isBackfilled(undefined), false);
    assert.equal(isBackfilled({ clientIds: 'nope' }), false);
  });
});

describe('backfill idempotency (guard + derivation together)', () => {
  /** Mirror the script loop's per-doc decision without an Admin app. */
  function planDoc(data) {
    return isBackfilled(data) ? { skip: true } : { skip: false, write: clientFieldsFromLegacy(data) };
  }

  it('re-running skips a doc already carrying clientIds (even if legacy drifts)', () => {
    // First pass backfills a legacy doc…
    const legacy = { clientId: 'c1', clientNameDenorm: 'Ann Lee' };
    const first = planDoc(legacy);
    assert.equal(first.skip, false);
    assert.deepEqual(first.write, { clientIds: ['c1'], clients: [{ id: 'c1', name: 'Ann Lee' }] });

    // …a second pass over the now-backfilled doc is a no-op (idempotent).
    const backfilled = { ...legacy, ...first.write };
    assert.deepEqual(planDoc(backfilled), { skip: true });

    // Even an empty backfilled array is treated as done (never re-derived).
    assert.deepEqual(planDoc({ clientId: 'c1', clientNameDenorm: 'Ann', clientIds: [] }), {
      skip: true,
    });
  });

  it('backfills an empty/missing legacy clientId to valid empty arrays', () => {
    for (const data of [{ clientId: '' }, {}, { clientId: '', clientNameDenorm: '' }]) {
      const plan = planDoc(data);
      assert.equal(plan.skip, false);
      assert.deepEqual(plan.write, { clientIds: [], clients: [] });
    }
  });
});
