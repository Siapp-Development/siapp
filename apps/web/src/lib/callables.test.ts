import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/firebase.ts', () => ({ functions: {} }));
vi.mock('firebase/functions', () => ({ httpsCallable: vi.fn() }));

import { httpsCallable } from 'firebase/functions';

import { exportProject, inviteErrorCode, projectErrorCode } from './callables.ts';

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

describe('projectErrorCode', () => {
  it('extracts a stable project/* code from HttpsError details', () => {
    const error = { details: { code: 'project/invalid-transition' } };
    expect(projectErrorCode(error)).toBe('project/invalid-transition');
  });

  it('returns null for non-project codes and malformed errors', () => {
    expect(projectErrorCode({ details: { code: 'invite/expired' } })).toBeNull();
    expect(projectErrorCode(new Error('boom'))).toBeNull();
    expect(projectErrorCode(null)).toBeNull();
  });
});

describe('exportProject wrapper (#25)', () => {
  it('invokes the exportProject callable with the request and unwraps .data', async () => {
    const payload = { exportVersion: 1, workspaceId: 'w1', projectId: 'p1' };
    const call = vi.fn().mockResolvedValue({ data: payload });
    vi.mocked(httpsCallable).mockReturnValue(call as never);

    const result = await exportProject({ workspaceId: 'w1', projectId: 'p1' });

    expect(httpsCallable).toHaveBeenCalledWith({}, 'exportProject');
    expect(call).toHaveBeenCalledWith({ workspaceId: 'w1', projectId: 'p1' });
    expect(result).toEqual(payload);
  });
});
