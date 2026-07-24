/**
 * portalErrorCode (#21 D1): extracts the stable `portal/*` code carried in
 * HttpsError details so the shell can distinguish "link dead" from
 * transient failures. Full redeem flows are left to integration tests.
 */

import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/firebase.ts', () => ({ auth: {}, functions: {} }));
vi.mock('firebase/auth', () => ({ signInWithCustomToken: vi.fn() }));
vi.mock('firebase/functions', () => ({ httpsCallable: vi.fn() }));

import { portalErrorCode } from './usePortalSession.ts';

describe('portalErrorCode', () => {
  it('returns the portal/* code from HttpsError details', () => {
    expect(portalErrorCode({ details: { code: 'portal/invalid_or_expired' } })).toBe(
      'portal/invalid_or_expired',
    );
  });

  it('ignores non-portal codes and malformed shapes', () => {
    expect(portalErrorCode({ details: { code: 'invite/expired' } })).toBeNull();
    expect(portalErrorCode({ details: 'nope' })).toBeNull();
    expect(portalErrorCode(new Error('network'))).toBeNull();
    expect(portalErrorCode(null)).toBeNull();
    expect(portalErrorCode(undefined)).toBeNull();
  });
});
