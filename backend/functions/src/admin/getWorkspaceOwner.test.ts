/**
 * Unit tests for the pure `resolveOwner` helper (#113). Firestore/Auth
 * assembly (guard, workspace lookup, member-doc → auth fallback) runs in the
 * emulator walkthrough; here we cover the branch precedence and null handling.
 */

import type { CallableRequest } from 'firebase-functions/v2/https';
import { afterEach, describe, expect, it } from 'vitest';

import { getWorkspaceOwner, resolveOwner, type IGetWorkspaceOwnerInput } from './getWorkspaceOwner.js';

describe('resolveOwner', () => {
  it('uses the member doc when present (source: member)', () => {
    expect(
      resolveOwner('owner-1', { displayName: 'Aisha Owner', email: 'aisha@firm.my' }, null, false),
    ).toEqual({
      uid: 'owner-1',
      displayName: 'Aisha Owner',
      email: 'aisha@firm.my',
      source: 'member',
      authUserDeleted: false,
    });
  });

  it('falls back to the auth record when the member doc is absent (source: auth)', () => {
    expect(
      resolveOwner('owner-2', null, { displayName: 'Ben Auth', email: 'ben@firm.my' }, false),
    ).toEqual({
      uid: 'owner-2',
      displayName: 'Ben Auth',
      email: 'ben@firm.my',
      source: 'auth',
      authUserDeleted: false,
    });
  });

  it('reports unresolved with authUserDeleted when the auth user is gone', () => {
    expect(resolveOwner('owner-3', null, null, true)).toEqual({
      uid: 'owner-3',
      displayName: null,
      email: null,
      source: 'unresolved',
      authUserDeleted: true,
    });
  });

  it('reports unresolved (not deleted) when the workspace has no owner', () => {
    expect(resolveOwner('', null, null, false)).toEqual({
      uid: '',
      displayName: null,
      email: null,
      source: 'unresolved',
      authUserDeleted: false,
    });
  });

  it('nulls missing member displayName/email rather than emitting undefined', () => {
    expect(resolveOwner('owner-4', {}, null, false)).toEqual({
      uid: 'owner-4',
      displayName: null,
      email: null,
      source: 'member',
      authUserDeleted: false,
    });
  });

  it('nulls a missing auth email while keeping the displayName (source: auth)', () => {
    expect(resolveOwner('owner-5', null, { displayName: 'Cara Auth' }, false)).toEqual({
      uid: 'owner-5',
      displayName: 'Cara Auth',
      email: null,
      source: 'auth',
      authUserDeleted: false,
    });
  });
});

/**
 * Callable-level tests: the DTO assembly (workspace lookup, member→auth
 * fallback) is exercised in the emulator walkthrough, but the guard and input
 * validation run *before* any Firestore/Auth access, so we assert them here
 * without the emulator. This proves the handler actually invokes
 * `assertAdminCall` (guard internals themselves are covered by
 * `adminGuard.test.ts`).
 */
const ORIGINAL_ENV = { ...process.env };

function makeRequest(
  overrides: {
    auth?: object | undefined;
    claims?: Record<string, unknown>;
  },
  data: IGetWorkspaceOwnerInput,
): CallableRequest<IGetWorkspaceOwnerInput> {
  const claims = overrides.claims ?? { isAdmin: true };
  return {
    auth: 'auth' in overrides ? overrides.auth : { uid: 'admin1', token: claims },
    rawRequest: { headers: {}, ip: '203.0.113.7' },
    data,
  } as unknown as CallableRequest<IGetWorkspaceOwnerInput>;
}

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

describe('getWorkspaceOwner (guard + validation)', () => {
  it('rejects an unauthenticated caller before touching Firestore', async () => {
    process.env['FUNCTIONS_EMULATOR'] = 'true';
    await expect(getWorkspaceOwner(makeRequest({ auth: undefined }, { wid: 'wksA' }))).rejects.toThrowError(
      /Authentication required/,
    );
  });

  it('rejects a non-admin caller before touching Firestore', async () => {
    process.env['FUNCTIONS_EMULATOR'] = 'true';
    await expect(
      getWorkspaceOwner(makeRequest({ claims: { isAdmin: false } }, { wid: 'wksA' })),
    ).rejects.toThrowError(/Not a Siapp admin/);
  });

  it('rejects an empty wid with invalid-argument once past the guard', async () => {
    process.env['FUNCTIONS_EMULATOR'] = 'true';
    delete process.env['ADMIN_IP_ALLOWLIST'];
    await expect(getWorkspaceOwner(makeRequest({}, { wid: '   ' }))).rejects.toThrowError(
      /wid is required/,
    );
  });
});
