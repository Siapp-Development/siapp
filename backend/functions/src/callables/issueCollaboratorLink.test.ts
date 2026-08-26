/**
 * #127 issueCollaboratorLink: the owner/admin/pm issuer gate plus the durable,
 * reset-only link lifecycle — mintCollaboratorLink (rotate: revoke every active
 * link + mint) and getOrCreateCollaboratorLink (idempotent: reuse an active,
 * unexpired, tokenful link; otherwise mint). Exercised against a tiny in-memory
 * Firestore fake so no emulator is needed (matches the pure-test convention).
 */

import { HttpsError, type CallableRequest } from 'firebase-functions/v2/https';
import { describe, expect, it, vi } from 'vitest';

// Deterministic Timestamp/FieldValue without the Admin SDK runtime.
vi.mock('firebase-admin/firestore', () => ({
  Timestamp: {
    now: () => ({ toMillis: () => 1_000_000 }),
    fromMillis: (ms: number) => ({ toMillis: () => ms, __ms: ms }),
  },
  FieldValue: { serverTimestamp: () => '<serverTimestamp>' },
  getFirestore: () => {
    throw new Error('getFirestore should not be called — pass a fake db');
  },
}));

import {
  getOrCreateCollaboratorLink,
  mintCollaboratorLink,
  requireCollabLinkIssuer,
} from './issueCollaboratorLink.js';

function issuerRequest(role: string | undefined, uid: string | undefined = 'u-owner') {
  return {
    auth: uid
      ? { uid, token: role ? { workspaces: { w1: { role } } } : {} }
      : undefined,
  } as unknown as CallableRequest;
}

interface IActiveLink {
  id: string;
  updates: Record<string, unknown>[];
  get: (field: string) => unknown;
  ref: { update: (data: Record<string, unknown>) => Promise<void> };
}

function activeLink(
  id: string,
  opts: { token?: unknown; expiresMs?: number | null },
): IActiveLink {
  const updates: Record<string, unknown>[] = [];
  return {
    id,
    updates,
    get: (field: string) =>
      field === 'expiresAt'
        ? opts.expiresMs == null
          ? undefined
          : { toMillis: () => opts.expiresMs as number }
        : field === 'token'
          ? opts.token
          : undefined,
    ref: {
      update: (data) => {
        updates.push(data);
        return Promise.resolve();
      },
    },
  };
}

function makeDb(activeDocs: IActiveLink[]) {
  const created: { id: string; data: Record<string, unknown> }[] = [];
  let auto = 0;
  const collectionRef = {
    where: () => collectionRef,
    get: () => Promise.resolve({ docs: activeDocs }),
    doc: () => {
      const id = `newlink${(auto += 1)}`;
      return {
        id,
        set: (data: Record<string, unknown>) => {
          created.push({ id, data });
          return Promise.resolve();
        },
      };
    },
  };
  const db = { collection: () => collectionRef } as never;
  return { db, created };
}

describe('requireCollabLinkIssuer', () => {
  it('throws unauthenticated without a signed-in user', () => {
    const noAuth = { auth: undefined } as unknown as CallableRequest;
    expect(() => requireCollabLinkIssuer(noAuth, 'w1')).toThrow(HttpsError);
  });

  it('allows owner / admin / pm', () => {
    for (const role of ['owner', 'admin', 'pm']) {
      expect(requireCollabLinkIssuer(issuerRequest(role), 'w1')).toEqual({
        uid: 'u-owner',
        role,
      });
    }
  });

  it('denies member / viewer / a non-member of the workspace', () => {
    for (const role of ['member', 'viewer', undefined]) {
      expect(() => requireCollabLinkIssuer(issuerRequest(role), 'w1')).toThrow(
        /role cannot issue/i,
      );
    }
  });
});

describe('mintCollaboratorLink (rotate)', () => {
  it('revokes EVERY active link and mints exactly one fresh /t link', async () => {
    const a = activeLink('old1', { token: 'tok1', expiresMs: 9_999_999 });
    const b = activeLink('old2', { token: 'tok2', expiresMs: 9_999_999 });
    const { db, created } = makeDb([a, b]);

    const result = await mintCollaboratorLink(db, 'w1', 'col1', 'u-owner');

    expect(a.updates[0]).toMatchObject({ revoked: true, revokedBy: 'u-owner' });
    expect(b.updates[0]).toMatchObject({ revoked: true, revokedBy: 'u-owner' });
    expect(created).toHaveLength(1);
    expect(created[0].data).toMatchObject({
      audience: 'collaborator',
      scopeType: 'collaborator',
      scopeId: 'col1',
      subjectId: 'col1',
      revoked: false,
      createdBy: 'u-owner',
    });
    // The raw URL token is persisted server-side for durable re-surfacing.
    expect(typeof created[0].data['token']).toBe('string');
    expect(result.url).toMatch(new RegExp(`/t/${created[0].data['token'] as string}$`));
    expect(result.linkId).toBe(created[0].id);
  });
});

describe('getOrCreateCollaboratorLink (durable, idempotent)', () => {
  it('reuses an active, unexpired, tokenful link — no new doc, no revoke', async () => {
    const existing = activeLink('link-existing', {
      token: 'reused_token_abc',
      expiresMs: Date.now() + 60_000,
    });
    const { db, created } = makeDb([existing]);

    const result = await getOrCreateCollaboratorLink(db, 'w1', 'col1', 'u-owner');

    expect(result.created).toBe(false);
    expect(result.linkId).toBe('link-existing');
    expect(result.url).toMatch(/\/t\/reused_token_abc$/);
    expect(created).toHaveLength(0);
    expect(existing.updates).toHaveLength(0);
  });

  it('mints a fresh link when the active one is expired (and revokes it)', async () => {
    const expired = activeLink('link-expired', {
      token: 'stale_token',
      expiresMs: Date.now() - 60_000,
    });
    const { db, created } = makeDb([expired]);

    const result = await getOrCreateCollaboratorLink(db, 'w1', 'col1', 'u-owner');

    expect(result.created).toBe(true);
    expect(created).toHaveLength(1);
    expect(expired.updates[0]).toMatchObject({ revoked: true });
  });

  it('mints a fresh link when the active one has no re-surfaceable token', async () => {
    const tokenless = activeLink('link-tokenless', {
      token: '',
      expiresMs: Date.now() + 60_000,
    });
    const { db, created } = makeDb([tokenless]);

    const result = await getOrCreateCollaboratorLink(db, 'w1', 'col1', 'u-owner');

    expect(result.created).toBe(true);
    expect(created).toHaveLength(1);
  });

  it('mints a fresh link when the collaborator has no active link at all', async () => {
    const { db, created } = makeDb([]);
    const result = await getOrCreateCollaboratorLink(db, 'w1', 'col1', 'u-owner');
    expect(result.created).toBe(true);
    expect(created).toHaveLength(1);
  });
});
