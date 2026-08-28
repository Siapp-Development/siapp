/**
 * Pure gate tests for issuePortalLink (#21): the D-027 lifecycle gate and
 * linked-client requirement. The Firestore/audit side runs in the emulator
 * walkthrough; role gating mirrors the other callables' claim checks.
 */

import { describe, expect, it, vi } from 'vitest';

// Deterministic Timestamp/FieldValue without the Admin SDK runtime (mirrors
// issueCollaboratorLink.test.ts). getFirestore must never be called — every
// mint test injects a fake db.
vi.mock('firebase-admin/firestore', () => ({
  Timestamp: {
    now: () => ({ toMillis: () => 1_000_000 }),
    fromMillis: (ms: number) => ({ toMillis: () => ms, toDate: () => new Date(ms) }),
  },
  FieldValue: { serverTimestamp: () => '<serverTimestamp>' },
  getFirestore: () => {
    throw new Error('getFirestore should not be called — pass a fake db');
  },
}));

import { PORTAL_ISSUABLE_LIFECYCLES, issueBlocker, mintClientPortalLink } from './issuePortalLink.js';

describe('issueBlocker', () => {
  it('allows published and completed projects with a linked client', () => {
    for (const lifecycle of PORTAL_ISSUABLE_LIFECYCLES) {
      expect(issueBlocker({ projectExists: true, lifecycle, clientId: 'c1' })).toBeNull();
    }
  });

  it('rejects a missing project', () => {
    expect(issueBlocker({ projectExists: false, lifecycle: 'published', clientId: 'c1' })).toBe(
      'not-found',
    );
  });

  it('rejects draft, archived and deleted lifecycles (D-027 gate)', () => {
    for (const lifecycle of ['draft', 'archived', 'deleted']) {
      expect(issueBlocker({ projectExists: true, lifecycle, clientId: 'c1' })).toBe(
        'not-published',
      );
    }
  });

  it('rejects a malformed lifecycle value', () => {
    expect(issueBlocker({ projectExists: true, lifecycle: 42, clientId: 'c1' })).toBe(
      'not-published',
    );
    expect(issueBlocker({ projectExists: true, lifecycle: undefined, clientId: 'c1' })).toBe(
      'not-published',
    );
  });

  it('rejects a project without a linked client', () => {
    expect(issueBlocker({ projectExists: true, lifecycle: 'published', clientId: '' })).toBe(
      'no-client',
    );
    expect(
      issueBlocker({ projectExists: true, lifecycle: 'published', clientId: undefined }),
    ).toBe('no-client');
  });
});


interface IActiveDoc {
  ref: { id: string; updates: Record<string, unknown>[] };
}

function activeDoc(id: string): IActiveDoc {
  const updates: Record<string, unknown>[] = [];
  return { ref: { id, updates } };
}

function makeMintDb(activeDocs: IActiveDoc[]) {
  const created: { id: string; data: Record<string, unknown> }[] = [];
  let auto = 0;
  const query = { where: () => query };
  const linksRef = {
    where: () => query,
    doc: () => ({ id: `newlink${(auto += 1)}` }),
  };
  const tx = {
    get: () => Promise.resolve({ docs: activeDocs, empty: activeDocs.length === 0 }),
    update: (ref: { updates: Record<string, unknown>[] }, data: Record<string, unknown>) => {
      ref.updates.push(data);
    },
    set: (ref: { id: string }, data: Record<string, unknown>) => {
      created.push({ id: ref.id, data });
    },
  };
  const db = {
    collection: () => linksRef,
    runTransaction: (fn: (t: typeof tx) => Promise<boolean>) => fn(tx),
  } as never;
  return { db, created };
}

describe('mintClientPortalLink (rotate-on-issue, #137 extraction)', () => {
  it('mints a fresh, one-active link when none exists (rotated:false)', async () => {
    const { db, created } = makeMintDb([]);

    const result = await mintClientPortalLink(db, 'w1', 'p1', 'c1', 'u-owner');

    expect(created).toHaveLength(1);
    expect(created[0].data).toMatchObject({
      audience: 'client',
      scopeType: 'project',
      scopeId: 'p1',
      subjectId: 'c1',
      revoked: false,
      createdBy: 'u-owner',
    });
    expect(result.rotated).toBe(false);
    expect(result.linkId).toBe(created[0].id);
    // A fresh, non-empty bare token — {shortCode}_{secret}, never a URL.
    expect(result.token).toMatch(/^[a-zA-Z0-9]{12}_/);
    expect(result.token).not.toMatch(/^https?:/);
    // The full URL wraps that same token on the /p portal path (origin comes
    // from the PORTAL_ORIGIN param, unset in the unit env).
    expect(result.url).toMatch(new RegExp(`/p/${result.token}$`));
  });

  it('preserves rotate semantics: revokes EVERY prior active link (rotated:true)', async () => {
    const a = activeDoc('old1');
    const b = activeDoc('old2');
    const { db, created } = makeMintDb([a, b]);

    const result = await mintClientPortalLink(db, 'w1', 'p1', 'c1', 'u-owner');

    expect(a.ref.updates[0]).toMatchObject({ revoked: true, revokedBy: 'u-owner' });
    expect(b.ref.updates[0]).toMatchObject({ revoked: true, revokedBy: 'u-owner' });
    expect(created).toHaveLength(1);
    expect(result.rotated).toBe(true);
  });

  it('never persists the plaintext token/secret — only its SHA-256 hash at rest', async () => {
    const { db, created } = makeMintDb([]);

    const result = await mintClientPortalLink(db, 'w1', 'p1', 'c1', 'u-owner');

    const stored = created[0].data;
    expect(typeof stored['secretHash']).toBe('string');
    expect(stored).not.toHaveProperty('token');
    expect(stored).not.toHaveProperty('secret');
    // The stored hash is not the raw secret (Part B durable storage deferred).
    expect(stored['secretHash']).not.toBe(result.token);
  });
});
