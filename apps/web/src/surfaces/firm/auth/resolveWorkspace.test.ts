import { describe, expect, it } from 'vitest';

import { parseWorkspaceClaims, resolveWorkspace } from './resolveWorkspace.ts';

describe('parseWorkspaceClaims', () => {
  it('keeps well-formed workspace entries', () => {
    const claims = parseWorkspaceClaims({
      workspaces: {
        wksA: { role: 'owner', departments: [] },
        wksB: { role: 'pm', departments: ['electrical'] },
      },
    });

    expect(claims).toEqual({
      workspaces: {
        wksA: { role: 'owner', departments: [] },
        wksB: { role: 'pm', departments: ['electrical'] },
      },
    });
  });

  it('drops malformed entries instead of trusting them', () => {
    const claims = parseWorkspaceClaims({
      workspaces: {
        good: { role: 'viewer', departments: [] },
        badRole: { role: 'superadmin', departments: [] },
        badDepartments: { role: 'pm', departments: [1, 2] },
        notAnObject: 'owner',
      },
    });

    expect(Object.keys(claims.workspaces)).toEqual(['good']);
  });

  it('returns empty workspaces when the claim is missing', () => {
    expect(parseWorkspaceClaims({})).toEqual({ workspaces: {} });
    expect(parseWorkspaceClaims({ workspaces: 'garbage' })).toEqual({ workspaces: {} });
  });
});

describe('resolveWorkspace', () => {
  const twoWorkspaces = {
    workspaces: {
      wksA: { role: 'owner' as const, departments: [] },
      wksB: { role: 'pm' as const, departments: [] },
    },
  };

  it('resolves to the default workspace when it is still claimed', () => {
    expect(resolveWorkspace(twoWorkspaces, 'wksB')).toEqual({ kind: 'one', workspaceId: 'wksB' });
  });

  it('ignores a stale default that is no longer in the claims', () => {
    expect(resolveWorkspace(twoWorkspaces, 'wksGone')).toEqual({
      kind: 'many',
      workspaceIds: ['wksA', 'wksB'],
    });
  });

  it('resolves a single membership directly', () => {
    const single = { workspaces: { wksA: { role: 'viewer' as const, departments: [] } } };
    expect(resolveWorkspace(single)).toEqual({ kind: 'one', workspaceId: 'wksA' });
  });

  it('asks for a picker with multiple memberships and no default', () => {
    expect(resolveWorkspace(twoWorkspaces)).toEqual({
      kind: 'many',
      workspaceIds: ['wksA', 'wksB'],
    });
  });

  it('reports none for empty claims', () => {
    expect(resolveWorkspace({ workspaces: {} })).toEqual({ kind: 'none' });
  });
});
