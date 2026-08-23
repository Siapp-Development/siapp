import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Unit tests for the #104 profile fan-out. The Admin SDK is mocked (no real
 * Firestore): `getFirestore()` returns a fake db whose collectionGroup query,
 * batch, and `FieldValue.delete()` sentinel are all captured so we can assert
 * the fan-out targets and payloads — mirroring how syncMemberClaims is tested.
 */
const fake = vi.hoisted(() => ({
  DELETE: { __sentinel: 'FieldValue.delete()' } as const,
  memberDocs: [] as Array<{ ref: { path: string } }>,
  empty: true,
  whereArgs: null as null | { field: string; op: string; value: unknown },
  batchSets: [] as Array<{ ref: { path: string }; data: Record<string, unknown>; opts: unknown }>,
  committed: 0,
}));

vi.mock('firebase-admin/firestore', () => ({
  FieldValue: { delete: () => fake.DELETE },
  getFirestore: () => ({
    collectionGroup: () => ({
      where: (field: string, op: string, value: unknown) => {
        fake.whereArgs = { field, op, value };
        return { get: () => Promise.resolve({ empty: fake.empty, docs: fake.memberDocs }) };
      },
    }),
    batch: () => ({
      set: (ref: { path: string }, data: Record<string, unknown>, opts: unknown) => {
        fake.batchSets.push({ ref, data, opts });
      },
      commit: () => {
        fake.committed += 1;
        return Promise.resolve();
      },
    }),
  }),
}));

import {
  isProfileSyncNoOp,
  memberProfilePatch,
  syncMemberProfile,
} from './syncMemberProfile.js';

type TDoc = Record<string, unknown> | undefined;

function makeEvent(before: TDoc, after: TDoc, uid = 'u1') {
  return {
    params: { uid },
    data: {
      before: { data: () => before },
      after: { data: () => after },
    },
  } as unknown as Parameters<typeof syncMemberProfile>[0];
}

beforeEach(() => {
  fake.memberDocs = [];
  fake.empty = true;
  fake.whereArgs = null;
  fake.batchSets = [];
  fake.committed = 0;
});

describe('isProfileSyncNoOp', () => {
  it('is a no-op when neither displayName nor photoUrl changed', () => {
    const doc = { displayName: 'Ada', photoUrl: 'https://x/a.png' };
    expect(isProfileSyncNoOp(doc, { ...doc, locale: 'en' })).toBe(true);
  });

  it('is not a no-op when the displayName changes', () => {
    expect(
      isProfileSyncNoOp({ displayName: 'Ada' }, { displayName: 'Ada Lovelace' }),
    ).toBe(false);
  });

  it('is not a no-op when a photo is added', () => {
    expect(
      isProfileSyncNoOp({ displayName: 'Ada' }, { displayName: 'Ada', photoUrl: 'https://x/a.png' }),
    ).toBe(false);
  });

  it('is not a no-op when a photo is removed', () => {
    expect(
      isProfileSyncNoOp({ displayName: 'Ada', photoUrl: 'https://x/a.png' }, { displayName: 'Ada' }),
    ).toBe(false);
  });

  it('treats an empty-string photoUrl the same as no photo (no phantom change)', () => {
    expect(
      isProfileSyncNoOp({ displayName: 'Ada', photoUrl: '' }, { displayName: 'Ada' }),
    ).toBe(true);
  });
});

describe('memberProfilePatch', () => {
  it('mirrors displayName and photoUrl when both are present', () => {
    expect(memberProfilePatch({ displayName: 'Ada', photoUrl: 'https://x/a.png' })).toEqual({
      displayName: 'Ada',
      photoUrl: 'https://x/a.png',
    });
  });

  it('writes a delete sentinel for photoUrl when the photo was removed', () => {
    const patch = memberProfilePatch({ displayName: 'Ada' });
    expect(patch['displayName']).toBe('Ada');
    expect(patch['photoUrl']).toBe(fake.DELETE);
  });

  it('writes a delete sentinel for an empty-string photoUrl', () => {
    expect(memberProfilePatch({ displayName: 'Ada', photoUrl: '' })['photoUrl']).toBe(fake.DELETE);
  });

  it('never blanks an absent displayName (only writes what is present)', () => {
    const patch = memberProfilePatch({ photoUrl: 'https://x/a.png' });
    expect('displayName' in patch).toBe(false);
    expect(patch['photoUrl']).toBe('https://x/a.png');
  });
});

describe('syncMemberProfile fan-out', () => {
  it('queries members by uid and merges the patch onto every member doc', async () => {
    fake.empty = false;
    fake.memberDocs = [
      { ref: { path: 'workspaces/wksA/members/u1' } },
      { ref: { path: 'workspaces/wksB/members/u1' } },
    ];

    await syncMemberProfile(
      makeEvent({ displayName: 'Ada' }, { displayName: 'Ada', photoUrl: 'https://x/a.png' }),
    );

    expect(fake.whereArgs).toEqual({ field: 'uid', op: '==', value: 'u1' });
    expect(fake.batchSets).toHaveLength(2);
    expect(fake.batchSets.map((s) => s.ref.path)).toEqual([
      'workspaces/wksA/members/u1',
      'workspaces/wksB/members/u1',
    ]);
    for (const write of fake.batchSets) {
      expect(write.data).toEqual({ displayName: 'Ada', photoUrl: 'https://x/a.png' });
      expect(write.opts).toEqual({ merge: true });
    }
    expect(fake.committed).toBe(1);
  });

  it('fans a photo removal out as a field delete', async () => {
    fake.empty = false;
    fake.memberDocs = [{ ref: { path: 'workspaces/wksA/members/u1' } }];

    await syncMemberProfile(
      makeEvent({ displayName: 'Ada', photoUrl: 'https://x/a.png' }, { displayName: 'Ada' }),
    );

    expect(fake.batchSets[0]?.data['photoUrl']).toBe(fake.DELETE);
    expect(fake.committed).toBe(1);
  });

  it('skips the fan-out entirely when nothing mirrored changed', async () => {
    const doc = { displayName: 'Ada', photoUrl: 'https://x/a.png' };

    await syncMemberProfile(makeEvent(doc, { ...doc, lastSeenAt: 'later' }));

    expect(fake.whereArgs).toBeNull();
    expect(fake.batchSets).toHaveLength(0);
    expect(fake.committed).toBe(0);
  });

  it('does nothing when the user doc was deleted (after is undefined)', async () => {
    await syncMemberProfile(makeEvent({ displayName: 'Ada' }, undefined));

    expect(fake.whereArgs).toBeNull();
    expect(fake.committed).toBe(0);
  });

  it('commits nothing when the user belongs to no workspaces', async () => {
    fake.empty = true;
    fake.memberDocs = [];

    await syncMemberProfile(
      makeEvent({ displayName: 'Ada' }, { displayName: 'Ada', photoUrl: 'https://x/a.png' }),
    );

    // Query ran, but there were no member docs to write.
    expect(fake.whereArgs).toEqual({ field: 'uid', op: '==', value: 'u1' });
    expect(fake.batchSets).toHaveLength(0);
    expect(fake.committed).toBe(0);
  });
});
