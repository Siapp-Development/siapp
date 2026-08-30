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


import { makeFakeMagicLinksDb } from './__fixtures__/fakeMagicLinksDb.js';

const WID = 'w1';
const PID = 'p1';
const CID = 'c1';

/** A seeded active, unexpired, tokenful client link doc + its anchor pointer. */
function seedActiveLink(
  id: string,
  overrides: Record<string, unknown> = {},
): { id: string; data: Record<string, unknown> } {
  return {
    id,
    data: {
      id,
      shortCode: `${id}shortcode`,
      secretHash: 'hash',
      token: `${id}shortcode_secretvalue`,
      audience: 'client',
      scopeType: 'project',
      scopeId: PID,
      subjectId: CID,
      revoked: false,
      expiresAt: { toMillis: () => Date.now() + 1_000_000, toDate: () => new Date() },
      ...overrides,
    },
  };
}

/**
 * Seeds the deterministic anchor pointer for the (WID, PID, CID) triple so
 * get-or-create / reset resolve the seeded active link. Mirrors what a prior
 * mint would have written.
 */
async function anchorFor(activeLinkId: string): Promise<{ id: string; data: Record<string, unknown> }> {
  const { portalLinkAnchorId } = await import('../lib/portalTokens.js');
  return {
    id: portalLinkAnchorId(WID, PID, CID),
    data: { kind: 'portal-anchor', activeLinkId, workspaceId: WID, projectId: PID, clientId: CID },
  };
}

describe('mintClientPortalLink (rotate-on-issue, anchor transaction #142)', () => {
  it('mints a fresh, one-active link when no anchor exists (rotated:false)', async () => {
    const { db, store, activeClientLinks } = makeFakeMagicLinksDb();

    const result = await mintClientPortalLink(db, WID, PID, CID, 'u-owner');

    const active = activeClientLinks();
    expect(active).toHaveLength(1);
    expect(active[0].data).toMatchObject({
      audience: 'client',
      scopeType: 'project',
      scopeId: PID,
      subjectId: CID,
      revoked: false,
      createdBy: 'u-owner',
    });
    expect(result.rotated).toBe(false);
    expect(result.linkId).toBe(active[0].id);
    // A fresh, non-empty bare token — {shortCode}_{secret}, never a URL.
    expect(result.token).toMatch(/^[a-zA-Z0-9]{12}_/);
    expect(result.token).not.toMatch(/^https?:/);
    expect(result.url).toMatch(new RegExp(`/p/${result.token}$`));
    // The anchor now points at the freshly minted link.
    const { portalLinkAnchorId } = await import('../lib/portalTokens.js');
    expect(store.get(portalLinkAnchorId(WID, PID, CID))?.data['activeLinkId']).toBe(result.linkId);
  });

  it('rotate revokes the anchor\'s prior active link (rotated:true)', async () => {
    const prior = seedActiveLink('old1');
    const { db, activeClientLinks, store } = makeFakeMagicLinksDb({
      links: [prior, await anchorFor('old1')],
    });

    const result = await mintClientPortalLink(db, WID, PID, CID, 'u-owner');

    expect(store.get('old1')?.data).toMatchObject({ revoked: true, revokedBy: 'u-owner' });
    const active = activeClientLinks();
    expect(active).toHaveLength(1);
    expect(active[0].id).not.toBe('old1');
    expect(result.rotated).toBe(true);
  });

  it('persists the durable plaintext token (rules-denied) but NEVER the bare secret (#142)', async () => {
    const { db, activeClientLinks } = makeFakeMagicLinksDb();

    const result = await mintClientPortalLink(db, WID, PID, CID, 'u-owner');

    const stored = activeClientLinks()[0].data;
    expect(typeof stored['secretHash']).toBe('string');
    expect(stored['token']).toBe(result.token);
    expect(stored).not.toHaveProperty('secret');
    expect(stored['secretHash']).not.toBe(result.token);
  });
});

describe('getOrCreateClientPortalLink (#142 durable, idempotent, anchored)', () => {
  it('reuses the anchored active, unexpired, tokenful link — SAME url, no mint (D-042)', async () => {
    const existing = seedActiveLink('link-existing');
    const { db, store } = makeFakeMagicLinksDb({ links: [existing, await anchorFor('link-existing')] });
    const before = store.size;

    const result = await getOrCreateClientPortalLink(db, WID, PID, CID, 'system');

    expect(result.created).toBe(false);
    expect(result.linkId).toBe('link-existing');
    expect(result.token).toBe('link-existingshortcode_secretvalue');
    expect(result.url).toMatch(/\/p\/link-existingshortcode_secretvalue$/);
    expect(store.size).toBe(before); // no new doc minted
  });

  it('returns the SAME token on repeated calls (in-flight WhatsApp links never 404)', async () => {
    const existing = seedActiveLink('link-existing');
    const { db } = makeFakeMagicLinksDb({ links: [existing, await anchorFor('link-existing')] });

    const first = await getOrCreateClientPortalLink(db, WID, PID, CID, 'system');
    const second = await getOrCreateClientPortalLink(db, WID, PID, CID, 'system');

    expect(second.token).toBe(first.token);
    expect(second.created).toBe(false);
  });

  it('mints a fresh durable link with createdBy:system when no anchor exists (created:true)', async () => {
    const { db, activeClientLinks } = makeFakeMagicLinksDb();

    const result = await getOrCreateClientPortalLink(db, WID, PID, CID, 'system');

    expect(result.created).toBe(true);
    const active = activeClientLinks();
    expect(active).toHaveLength(1);
    expect(active[0].data).toMatchObject({ audience: 'client', createdBy: 'system' });
    expect(active[0].data['token']).toBe(result.token);
  });

  it('mints fresh AND revokes the prior when the anchored link is expired', async () => {
    const stale = seedActiveLink('old-expired', {
      expiresAt: { toMillis: () => Date.now() - 60_000, toDate: () => new Date() },
    });
    const { db, store, activeClientLinks } = makeFakeMagicLinksDb({
      links: [stale, await anchorFor('old-expired')],
    });

    const result = await getOrCreateClientPortalLink(db, WID, PID, CID, 'system');

    expect(result.created).toBe(true);
    expect(store.get('old-expired')?.data['revoked']).toBe(true);
    expect(activeClientLinks()).toHaveLength(1);
    expect(activeClientLinks()[0].id).toBe(result.linkId);
  });

  it('mints fresh when the anchored link has no re-surfaceable token', async () => {
    const tokenless = seedActiveLink('link-tokenless', { token: '' });
    const { db, activeClientLinks } = makeFakeMagicLinksDb({
      links: [tokenless, await anchorFor('link-tokenless')],
    });

    const result = await getOrCreateClientPortalLink(db, WID, PID, CID, 'system');

    expect(result.created).toBe(true);
    expect(activeClientLinks()[0].id).toBe(result.linkId);
  });
});
