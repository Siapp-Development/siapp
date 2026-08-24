import type { User } from 'firebase/auth';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { upsertOwnProfile } from './AuthProvider.tsx';

// Firebase app init is side-effectful; stub the singletons the module reads.
vi.mock('@/lib/firebase.ts', () => ({ auth: {}, db: {} }));

// serverTimestamp() must be a stable sentinel so patches can be asserted
// structurally without touching the real Firebase SDK.
const SERVER_TS = { __sentinel: 'serverTimestamp' };

const firestoreMock = vi.hoisted(() => ({
  doc: vi.fn(),
  getDoc: vi.fn(),
  updateDoc: vi.fn(),
  setDoc: vi.fn(),
  serverTimestamp: vi.fn(),
}));

vi.mock('firebase/firestore', () => ({
  // Timestamp is referenced at module scope (live-subscribe effect) but never
  // exercised by upsertOwnProfile; a lightweight stand-in keeps the import valid.
  Timestamp: class Timestamp {},
  doc: (...args: unknown[]) => firestoreMock.doc(...args),
  getDoc: (...args: unknown[]) => firestoreMock.getDoc(...args),
  updateDoc: (...args: unknown[]) => firestoreMock.updateDoc(...args),
  setDoc: (...args: unknown[]) => firestoreMock.setDoc(...args),
  serverTimestamp: () => firestoreMock.serverTimestamp(),
  onSnapshot: vi.fn(),
}));

const DOC_REF = { __ref: 'users/ref' };

/** Build a getDoc snapshot fake. Pass `null` to model a non-existent doc. */
function snapshotOf(data: Record<string, unknown> | null) {
  return {
    exists: () => data !== null,
    data: () => data ?? undefined,
  };
}

/** Minimal Auth User for upsertOwnProfile — only uid/email/displayName matter. */
function fakeUser(overrides: Partial<User> = {}): User {
  return {
    uid: 'u1',
    email: 'rania@work.test',
    displayName: 'Rania',
    ...overrides,
  } as User;
}

beforeEach(() => {
  firestoreMock.doc.mockReset().mockReturnValue(DOC_REF);
  firestoreMock.getDoc.mockReset();
  firestoreMock.updateDoc.mockReset().mockResolvedValue(undefined);
  firestoreMock.setDoc.mockReset().mockResolvedValue(undefined);
  firestoreMock.serverTimestamp.mockReset().mockReturnValue(SERVER_TS);
});

describe('upsertOwnProfile — existing profile self-heal (#104 casing-drift fix)', () => {
  it('leaves a case-drifted stored email untouched (rule tolerates casing) and never touches createdAt/claimsUpdatedAt', async () => {
    // Stored casing (`Rania@Work.test`) differs from the token only by CASE.
    // Because validUserProfile now compares `.lower()` on both sides, the merged
    // doc already passes — so the self-heal condition
    // (`storedEmail.toLowerCase() !== authEmail.toLowerCase()`) is FALSE and the
    // provider issues no email rewrite; it only bumps lastSeenAt. (See FINDING:
    // the plan's test-plan bullet expected an email rewrite here, but the
    // implemented condition never fires on pure casing drift.)
    firestoreMock.getDoc.mockResolvedValue(
      snapshotOf({
        uid: 'u1',
        email: 'Rania@Work.test',
        displayName: 'Rania',
        createdAt: 'CREATED',
        claimsUpdatedAt: 'STAMP',
      }),
    );

    await upsertOwnProfile(fakeUser({ email: 'rania@work.test', displayName: 'Rania' }));

    expect(firestoreMock.setDoc).not.toHaveBeenCalled();
    expect(firestoreMock.updateDoc).toHaveBeenCalledTimes(1);
    const [ref, patch] = firestoreMock.updateDoc.mock.calls[0];
    expect(ref).toBe(DOC_REF);
    expect(patch).toEqual({ lastSeenAt: SERVER_TS });
    expect(patch).not.toHaveProperty('createdAt');
    expect(patch).not.toHaveProperty('claimsUpdatedAt');
  });

  it('rewrites the stored email when the token email is a genuinely different address', async () => {
    // The email self-heal branch DOES fire when the addresses differ
    // case-insensitively (e.g. the user changed their Auth email): the doc must
    // converge to the current token email so partial saves keep passing.
    firestoreMock.getDoc.mockResolvedValue(
      snapshotOf({
        uid: 'u1',
        email: 'old@work.test',
        displayName: 'Rania',
        createdAt: 'CREATED',
        claimsUpdatedAt: 'STAMP',
      }),
    );

    await upsertOwnProfile(fakeUser({ email: 'new@work.test', displayName: 'Rania' }));

    expect(firestoreMock.setDoc).not.toHaveBeenCalled();
    expect(firestoreMock.updateDoc).toHaveBeenCalledTimes(1);
    const [, patch] = firestoreMock.updateDoc.mock.calls[0];
    expect(patch).toEqual({ lastSeenAt: SERVER_TS, email: 'new@work.test' });
    expect(patch).not.toHaveProperty('createdAt');
    expect(patch).not.toHaveProperty('claimsUpdatedAt');
  });

  it('reconciles a drifted displayName', async () => {
    firestoreMock.getDoc.mockResolvedValue(
      snapshotOf({ uid: 'u1', email: 'rania@work.test', displayName: 'Old' }),
    );

    await upsertOwnProfile(fakeUser({ email: 'rania@work.test', displayName: 'New' }));

    expect(firestoreMock.updateDoc).toHaveBeenCalledTimes(1);
    const [, patch] = firestoreMock.updateDoc.mock.calls[0];
    expect(patch).toMatchObject({ displayName: 'New', lastSeenAt: SERVER_TS });
    // Email already matches (case-identical) — no email rewrite.
    expect(patch).not.toHaveProperty('email');
  });

  it('bumps only lastSeenAt when email and displayName already match (no-op reconcile)', async () => {
    firestoreMock.getDoc.mockResolvedValue(
      snapshotOf({ uid: 'u1', email: 'rania@work.test', displayName: 'Rania' }),
    );

    await upsertOwnProfile(fakeUser({ email: 'rania@work.test', displayName: 'Rania' }));

    expect(firestoreMock.updateDoc).toHaveBeenCalledTimes(1);
    const [, patch] = firestoreMock.updateDoc.mock.calls[0];
    expect(patch).toEqual({ lastSeenAt: SERVER_TS });
    expect(Object.keys(patch)).toEqual(['lastSeenAt']);
  });

  it('does not overwrite a stored displayName with an empty string from the token', async () => {
    firestoreMock.getDoc.mockResolvedValue(
      snapshotOf({ uid: 'u1', email: 'rania@work.test', displayName: 'Kept Name' }),
    );

    // Empty-string displayName must never be written (rule requires size() > 0).
    await upsertOwnProfile(
      fakeUser({ email: 'rania@work.test', displayName: '' } as Partial<User>),
    );

    expect(firestoreMock.updateDoc).toHaveBeenCalledTimes(1);
    const [, patch] = firestoreMock.updateDoc.mock.calls[0];
    expect(patch).not.toHaveProperty('displayName');
    expect(patch).toEqual({ lastSeenAt: SERVER_TS });
  });

  it('never writes an empty email when the token email is absent', async () => {
    firestoreMock.getDoc.mockResolvedValue(
      snapshotOf({ uid: 'u1', email: 'stored@work.test', displayName: 'Member' }),
    );

    await upsertOwnProfile(fakeUser({ email: null, displayName: 'Member' } as Partial<User>));

    expect(firestoreMock.updateDoc).toHaveBeenCalledTimes(1);
    const [, patch] = firestoreMock.updateDoc.mock.calls[0];
    expect(patch).not.toHaveProperty('email');
    expect(patch).toEqual({ lastSeenAt: SERVER_TS });
  });
});

describe('upsertOwnProfile — missing profile creates the full doc', () => {
  it('setDoc with the full merge payload when the profile does not exist', async () => {
    firestoreMock.getDoc.mockResolvedValue(snapshotOf(null));

    await upsertOwnProfile(fakeUser({ email: 'new@work.test', displayName: 'New User' }));

    expect(firestoreMock.updateDoc).not.toHaveBeenCalled();
    expect(firestoreMock.setDoc).toHaveBeenCalledTimes(1);
    const [ref, payload, options] = firestoreMock.setDoc.mock.calls[0];
    expect(ref).toBe(DOC_REF);
    expect(payload).toEqual({
      uid: 'u1',
      email: 'new@work.test',
      displayName: 'New User',
      locale: 'en',
      createdAt: SERVER_TS,
      lastSeenAt: SERVER_TS,
    });
    expect(options).toEqual({ merge: true });
  });

  it('treats a doc without a string email as missing and creates the full profile', async () => {
    // A doc carrying only the server-side claimsUpdatedAt stamp counts as missing.
    firestoreMock.getDoc.mockResolvedValue(snapshotOf({ claimsUpdatedAt: 'STAMP' }));

    await upsertOwnProfile(fakeUser({ email: 'seed@work.test', displayName: 'Seed' }));

    expect(firestoreMock.updateDoc).not.toHaveBeenCalled();
    expect(firestoreMock.setDoc).toHaveBeenCalledTimes(1);
    const [, payload] = firestoreMock.setDoc.mock.calls[0];
    expect(payload).toMatchObject({ uid: 'u1', email: 'seed@work.test', locale: 'en' });
  });

  it('falls back to "Member" displayName and empty email when the token has neither', async () => {
    firestoreMock.getDoc.mockResolvedValue(snapshotOf(null));

    await upsertOwnProfile(fakeUser({ email: null, displayName: null } as Partial<User>));

    const [, payload] = firestoreMock.setDoc.mock.calls[0];
    expect(payload).toMatchObject({ email: '', displayName: 'Member' });
  });
});
