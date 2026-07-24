import { describe, expect, it } from 'vitest';

import { refsWith, refsWithout, type IPhoneRefKey } from './phoneIndex.js';

const KEY: IPhoneRefKey = { workspaceId: 'wksA', type: 'client', refId: 'client1' };

function ref(overrides: Partial<IPhoneRefKey> = {}): Record<string, unknown> {
  return { workspaceId: 'wksA', type: 'client', refId: 'client1', addedAt: 't0', ...overrides };
}

describe('refsWith', () => {
  it('appends the entry to an empty list', () => {
    expect(refsWith([], KEY, 'now')).toEqual([
      { workspaceId: 'wksA', type: 'client', refId: 'client1', addedAt: 'now' },
    ]);
  });

  it('is a no-op when the entry is already present', () => {
    const existing = [ref()];
    expect(refsWith(existing, KEY, 'now')).toEqual(existing);
  });

  it('keeps other refs — same phone shared across workspaces and types', () => {
    const other = ref({ workspaceId: 'wksB' });
    const collaborator = ref({ type: 'collaborator', refId: 'col1' });
    const next = refsWith([other, collaborator], KEY, 'now');

    expect(next).toHaveLength(3);
    expect(next).toContainEqual(other);
    expect(next).toContainEqual(collaborator);
  });

  it('tolerates a malformed refs value', () => {
    expect(refsWith('junk', KEY, 'now')).toEqual([
      { workspaceId: 'wksA', type: 'client', refId: 'client1', addedAt: 'now' },
    ]);
    expect(refsWith([null, 42, ref()], KEY, 'now')).toEqual([ref()]);
  });
});

describe('refsWithout', () => {
  it('removes only the matching entry', () => {
    const other = ref({ refId: 'client2' });
    expect(refsWithout([ref(), other], KEY)).toEqual([other]);
  });

  it('returns an empty list when the last ref is removed — caller deletes the doc', () => {
    expect(refsWithout([ref()], KEY)).toEqual([]);
  });

  it('is a no-op when the entry is absent', () => {
    const other = ref({ type: 'collaborator' });
    expect(refsWithout([other], KEY)).toEqual([other]);
  });

  it('tolerates a malformed refs value', () => {
    expect(refsWithout(undefined, KEY)).toEqual([]);
    expect(refsWithout([null, 'junk'], KEY)).toEqual([]);
  });
});

describe('phone move (remove + add composed)', () => {
  it('moving a phone leaves the old list without the ref and the new list with it', () => {
    const oldList = [ref(), ref({ refId: 'client2' })];

    const oldAfter = refsWithout(oldList, KEY);
    const newAfter = refsWith([], KEY, 'now');

    expect(oldAfter).toEqual([ref({ refId: 'client2' })]);
    expect(newAfter).toEqual([
      { workspaceId: 'wksA', type: 'client', refId: 'client1', addedAt: 'now' },
    ]);
  });
});
