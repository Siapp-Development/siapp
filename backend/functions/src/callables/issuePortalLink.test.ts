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

import {
  PORTAL_ISSUABLE_LIFECYCLES,
  getOrCreateClientPortalLink,
  issueBlocker,
  mintClientPortalLink,
} from './issuePortalLink.js';

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

  it('persists the durable plaintext token (rules-denied) but NEVER the bare secret (#142)', async () => {
    const { db, created } = makeMintDb([]);

    const result = await mintClientPortalLink(db, 'w1', 'p1', 'c1', 'u-owner');

    const stored = created[0].data;
    expect(typeof stored['secretHash']).toBe('string');
    // Durable (#142, Part B): the raw URL token is now stored so get-or-create
    // can re-surface the SAME url. magicLinks is rules-denied to all clients.
    expect(stored['token']).toBe(result.token);
    // The bare secret is never stored on its own; secretHash stays the only
    // value compared on redeem, so the stored token cannot weaken auth.
    expect(stored).not.toHaveProperty('secret');
    expect(stored['secretHash']).not.toBe(result.token);
  });
});

interface IQueryDoc {
  id: string;
  get: (field: string) => unknown;
}

function queryDoc(id: string, opts: { token: unknown; expiresMs: number | null }): IQueryDoc {
  return {
    id,
    get: (field: string) =>
      field === 'expiresAt'
        ? opts.expiresMs == null
          ? undefined
          : { toMillis: () => opts.expiresMs as number }
        : field === 'token'
          ? opts.token
          : undefined,
  };
}

function makeGocDb(opts: { queryDocs: IQueryDoc[]; txDocs?: IActiveDoc[] }) {
  const created: { id: string; data: Record<string, unknown> }[] = [];
  let auto = 0;
  const chain = {
    where: () => chain,
    get: () => Promise.resolve({ docs: opts.queryDocs }),
  };
  const linksRef = {
    where: () => chain,
    doc: () => ({ id: `newlink${(auto += 1)}` }),
  };
  const txDocs = opts.txDocs ?? [];
  const tx = {
    get: () => Promise.resolve({ docs: txDocs, empty: txDocs.length === 0 }),
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

describe('getOrCreateClientPortalLink (#142 durable, idempotent)', () => {
  it('reuses an active, unexpired, tokenful link — SAME url, no mint (D-042)', async () => {
    const { db, created } = makeGocDb({
      queryDocs: [queryDoc('link-existing', { token: 'reused_token_abc', expiresMs: Date.now() + 60_000 })],
    });

    const result = await getOrCreateClientPortalLink(db, 'w1', 'p1', 'c1', 'system');

    expect(result.created).toBe(false);
    expect(result.linkId).toBe('link-existing');
    expect(result.token).toBe('reused_token_abc');
    expect(result.url).toMatch(/\/p\/reused_token_abc$/);
    expect(created).toHaveLength(0);
  });

  it('returns the SAME token on repeated calls (in-flight WhatsApp links never 404)', async () => {
    const { db } = makeGocDb({
      queryDocs: [queryDoc('link-existing', { token: 'reused_token_abc', expiresMs: Date.now() + 60_000 })],
    });

    const first = await getOrCreateClientPortalLink(db, 'w1', 'p1', 'c1', 'system');
    const second = await getOrCreateClientPortalLink(db, 'w1', 'p1', 'c1', 'system');

    expect(second.token).toBe(first.token);
    expect(second.created).toBe(false);
  });

  it('mints a fresh durable link with createdBy:system when none exists (created:true)', async () => {
    const { db, created } = makeGocDb({ queryDocs: [], txDocs: [] });

    const result = await getOrCreateClientPortalLink(db, 'w1', 'p1', 'c1', 'system');

    expect(result.created).toBe(true);
    expect(created).toHaveLength(1);
    expect(created[0].data).toMatchObject({ audience: 'client', createdBy: 'system' });
    // The durable plaintext token is stored so future calls re-surface it.
    expect(created[0].data['token']).toBe(result.token);
  });

  it('mints fresh AND revokes the prior when the active link is expired', async () => {
    const stale = activeDoc('old-expired');
    const { db, created } = makeGocDb({
      queryDocs: [queryDoc('old-expired', { token: 'stale', expiresMs: Date.now() - 60_000 })],
      txDocs: [stale],
    });

    const result = await getOrCreateClientPortalLink(db, 'w1', 'p1', 'c1', 'system');

    expect(result.created).toBe(true);
    expect(created).toHaveLength(1);
    expect(stale.ref.updates[0]).toMatchObject({ revoked: true });
  });

  it('mints fresh when the active link has no re-surfaceable token', async () => {
    const { db, created } = makeGocDb({
      queryDocs: [queryDoc('link-tokenless', { token: '', expiresMs: Date.now() + 60_000 })],
      txDocs: [],
    });

    const result = await getOrCreateClientPortalLink(db, 'w1', 'p1', 'c1', 'system');

    expect(result.created).toBe(true);
    expect(created).toHaveLength(1);
  });
});
