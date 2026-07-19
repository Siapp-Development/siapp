import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/firebase.ts', () => ({ functions: {} }));
vi.mock('firebase/functions', () => ({ httpsCallable: vi.fn() }));

import { inviteErrorCode } from './callables.ts';

describe('inviteErrorCode', () => {
  it('extracts a stable invite/* code from HttpsError details', () => {
    const error = { details: { code: 'invite/expired' } };
    expect(inviteErrorCode(error)).toBe('invite/expired');
  });

  it('returns null for non-invite codes and malformed errors', () => {
    expect(inviteErrorCode({ details: { code: 'other/thing' } })).toBeNull();
    expect(inviteErrorCode({ details: 'nope' })).toBeNull();
    expect(inviteErrorCode(new Error('boom'))).toBeNull();
    expect(inviteErrorCode(null)).toBeNull();
    expect(inviteErrorCode(undefined)).toBeNull();
  });
});
