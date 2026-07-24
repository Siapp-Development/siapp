import { describe, expect, it } from 'vitest';

import {
  CLAIMS_WARN_BYTES,
  buildClaimsPayload,
  claimsPayloadSizeBytes,
  isClaimsNoOp,
  isMemberRole,
  mergeMembershipClaims,
  toStringArray,
  upsertMembershipClaim,
} from './claims.js';

describe('buildClaimsPayload', () => {
  it('maps every membership into the workspaces record', () => {
    const payload = buildClaimsPayload([
      { workspaceId: 'wksA', role: 'owner', departments: [] },
      { workspaceId: 'wksB', role: 'pm', departments: ['electrical'] },
    ]);

    expect(payload).toEqual({
      workspaces: {
        wksA: { role: 'owner', departments: [] },
        wksB: { role: 'pm', departments: ['electrical'] },
      },
    });
  });

  it('produces an empty workspaces record when the last membership is removed', () => {
    expect(buildClaimsPayload([])).toEqual({ workspaces: {} });
  });

  it('copies the departments array instead of aliasing the input', () => {
    const departments = ['plumbing'];
    const payload = buildClaimsPayload([{ workspaceId: 'wksA', role: 'admin', departments }]);

    departments.push('mutated');

    expect(payload.workspaces['wksA']?.departments).toEqual(['plumbing']);
  });
});

describe('isClaimsNoOp', () => {
  const member = { role: 'pm', departments: ['electrical'], displayName: 'Alice' };

  it('skips updates that leave role and departments untouched', () => {
    expect(isClaimsNoOp(member, { ...member, displayName: 'Alice Renamed' })).toBe(true);
  });

  it('syncs when the role changes', () => {
    expect(isClaimsNoOp(member, { ...member, role: 'admin' })).toBe(false);
  });

  it('syncs when departments change', () => {
    expect(isClaimsNoOp(member, { ...member, departments: ['plumbing'] })).toBe(false);
  });

  it('syncs on create', () => {
    expect(isClaimsNoOp(undefined, member)).toBe(false);
  });

  it('syncs on delete', () => {
    expect(isClaimsNoOp(member, undefined)).toBe(false);
  });
});

describe('claims budget', () => {
  it('measures the serialized payload in bytes', () => {
    const payload = buildClaimsPayload([{ workspaceId: 'wksA', role: 'pm', departments: [] }]);

    expect(claimsPayloadSizeBytes(payload)).toBe(
      new TextEncoder().encode(JSON.stringify(payload)).length,
    );
  });

  it('keeps a realistic single-workspace payload far below the warn threshold', () => {
    const payload = buildClaimsPayload([
      { workspaceId: 'workspace-with-a-long-id', role: 'owner', departments: ['electrical'] },
    ]);

    expect(claimsPayloadSizeBytes(payload)).toBeLessThan(CLAIMS_WARN_BYTES);
  });
});

describe('field narrowing', () => {
  it('accepts only known member roles', () => {
    expect(isMemberRole('owner')).toBe(true);
    expect(isMemberRole('superadmin')).toBe(false);
    expect(isMemberRole(42)).toBe(false);
  });

  it('drops non-string department entries', () => {
    expect(toStringArray(['a', 1, 'b', null])).toEqual(['a', 'b']);
    expect(toStringArray('not-an-array')).toEqual([]);
  });
});

describe('mergeMembershipClaims', () => {
  const payload = buildClaimsPayload([{ workspaceId: 'wksA', role: 'owner', departments: [] }]);

  it('preserves non-membership claims like isAdmin (#62 regression)', () => {
    const merged = mergeMembershipClaims({ isAdmin: true }, payload);

    expect(merged).toEqual({
      isAdmin: true,
      workspaces: { wksA: { role: 'owner', departments: [] } },
    });
  });

  it('replaces the workspaces key wholesale so stale memberships are dropped', () => {
    const merged = mergeMembershipClaims(
      { isAdmin: true, workspaces: { stale: { role: 'pm', departments: [] } } },
      payload,
    );

    expect(merged['workspaces']).toEqual({ wksA: { role: 'owner', departments: [] } });
  });

  it('handles users with no existing claims', () => {
    expect(mergeMembershipClaims(undefined, payload)).toEqual({
      workspaces: { wksA: { role: 'owner', departments: [] } },
    });
  });
});

describe('upsertMembershipClaim', () => {
  it('adds a workspace without touching other memberships or isAdmin (#62 regression)', () => {
    const merged = upsertMembershipClaim(
      { isAdmin: true, workspaces: { wksA: { role: 'owner', departments: [] } } },
      'wksB',
      { role: 'pm', departments: [] },
    );

    expect(merged).toEqual({
      isAdmin: true,
      workspaces: {
        wksA: { role: 'owner', departments: [] },
        wksB: { role: 'pm', departments: [] },
      },
    });
  });

  it('overwrites an existing entry for the same workspace', () => {
    const merged = upsertMembershipClaim(
      { workspaces: { wksA: { role: 'viewer', departments: [] } } },
      'wksA',
      { role: 'admin', departments: ['electrical'] },
    );

    expect(merged['workspaces']).toEqual({
      wksA: { role: 'admin', departments: ['electrical'] },
    });
  });

  it('tolerates missing or malformed existing workspaces', () => {
    expect(upsertMembershipClaim(undefined, 'wksA', { role: 'pm', departments: [] })).toEqual({
      workspaces: { wksA: { role: 'pm', departments: [] } },
    });
    expect(
      upsertMembershipClaim({ workspaces: 'garbage' }, 'wksA', { role: 'pm', departments: [] }),
    ).toEqual({ workspaces: { wksA: { role: 'pm', departments: [] } } });
  });
});
