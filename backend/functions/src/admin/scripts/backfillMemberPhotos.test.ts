import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The backfill is a top-level script (side effects on import). We mock the
 * Admin SDK — `initializeApp` is a no-op and `getFirestore()` returns a fake db
 * seeded with users + members — then dynamically import the script and assert
 * which member docs it patched. The real `memberProfilePatch` runs (only the
 * `FieldValue.delete()` sentinel is faked), so the delete/mirror behaviour is
 * exercised end to end.
 */
const fake = vi.hoisted(() => ({
  DELETE: { __sentinel: 'FieldValue.delete()' } as const,
  users: [] as Array<{ id: string; data: () => Record<string, unknown> }>,
  membersByUid: {} as Record<string, Array<{ ref: { path: string } }>>,
  batchSets: [] as Array<{ ref: { path: string }; data: Record<string, unknown> }>,
  committed: 0,
  stdout: [] as string[],
}));

vi.mock('firebase-admin/app', () => ({ initializeApp: () => ({}) }));
vi.mock('firebase-admin/firestore', () => ({
  FieldValue: { delete: () => fake.DELETE },
  getFirestore: () => ({
    collection: () => ({ get: () => Promise.resolve({ docs: fake.users }) }),
    collectionGroup: () => ({
      where: (_field: string, _op: string, value: string) => ({
        get: () => {
          const docs = fake.membersByUid[value] ?? [];
          return Promise.resolve({ empty: docs.length === 0, docs });
        },
      }),
    }),
    batch: () => ({
      set: (ref: { path: string }, data: Record<string, unknown>) => {
        fake.batchSets.push({ ref, data });
      },
      commit: () => {
        fake.committed += 1;
        return Promise.resolve();
      },
    }),
  }),
}));

function userDoc(id: string, data: Record<string, unknown>) {
  return { id, data: () => data };
}

function seed() {
  fake.users = [
    userDoc('u1', { displayName: 'Ada', photoUrl: 'https://x/ada.png' }),
    userDoc('u2', { displayName: 'Bob' }), // no photo → delete sentinel
    userDoc('u4', { displayName: 'Cara' }), // no member docs → skipped
  ];
  fake.membersByUid = {
    u1: [{ ref: { path: 'workspaces/wksA/members/u1' } }],
    u2: [{ ref: { path: 'workspaces/wksB/members/u2' } }],
    // A member doc for u3 exists but no matching user, so it is never scanned.
    u3: [{ ref: { path: 'workspaces/wksA/members/u3' } }],
    u4: [],
  };
  fake.batchSets = [];
  fake.committed = 0;
  fake.stdout = [];
}

beforeEach(() => {
  seed();
  vi.spyOn(process.stdout, 'write').mockImplementation((chunk: unknown) => {
    fake.stdout.push(String(chunk));
    return true;
  });
  vi.resetModules();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('backfillMemberPhotos', () => {
  it('patches only member docs whose uid matches a scanned user', async () => {
    await import('./backfillMemberPhotos.js');

    const paths = fake.batchSets.map((s) => s.ref.path);
    expect(paths).toEqual(['workspaces/wksA/members/u1', 'workspaces/wksB/members/u2']);
    // u3 has a member doc but no user, so it is never touched.
    expect(paths).not.toContain('workspaces/wksA/members/u3');
  });

  it('mirrors a present photo and deletes a missing one', async () => {
    await import('./backfillMemberPhotos.js');

    const byPath = new Map(fake.batchSets.map((s) => [s.ref.path, s.data]));
    expect(byPath.get('workspaces/wksA/members/u1')).toEqual({
      displayName: 'Ada',
      photoUrl: 'https://x/ada.png',
    });
    expect(byPath.get('workspaces/wksB/members/u2')?.['photoUrl']).toBe(fake.DELETE);
  });

  it('reports how many users were scanned and members patched', async () => {
    await import('./backfillMemberPhotos.js');

    // 3 users scanned (u1, u2, u4); 2 member docs patched (u4 has none).
    expect(fake.stdout.join('')).toContain('scanned 3 users, patched 2 member docs');
  });

  it('is idempotent — a second run writes the identical patches', async () => {
    await import('./backfillMemberPhotos.js');
    const firstRun = fake.batchSets.map((s) => ({ path: s.ref.path, data: s.data }));

    // Reset only the captured writes, keep the same seed, and re-run.
    fake.batchSets = [];
    fake.committed = 0;
    vi.resetModules();
    await import('./backfillMemberPhotos.js');

    const secondRun = fake.batchSets.map((s) => ({ path: s.ref.path, data: s.data }));
    expect(secondRun).toEqual(firstRun);
  });
});
