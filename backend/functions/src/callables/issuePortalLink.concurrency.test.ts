/**
 * #142 (Part B) — the TOCTOU concurrency fix proof. The old get-or-create ran
 * an active-link QUERY outside any transaction; Firestore does not lock empty
 * result sets, so two concurrent first-mints for the same triple could create
 * TWO active links with DIFFERENT tokens (breaks one-active-link + D-042). The
 * fix funnels every mint through a transaction that reads a DETERMINISTIC
 * per-triple anchor docRef FIRST — the serialization point.
 *
 * These tests drive the REAL production get-or-create through the shared
 * optimistic-concurrency fake, using its one-shot contention hook to commit a
 * competing transaction between our read and our commit, and assert the loser
 * retries and converges on the SINGLE winning link/token.
 */

import { describe, expect, it, vi } from 'vitest';

vi.mock('firebase-admin/firestore', () => ({
  Timestamp: {
    now: () => ({ toMillis: () => Date.now() }),
    fromMillis: (ms: number) => ({ toMillis: () => ms, toDate: () => new Date(ms) }),
  },
  FieldValue: { serverTimestamp: () => '<serverTimestamp>' },
  getFirestore: () => {
    throw new Error('getFirestore should not be called — pass a fake db');
  },
}));

import {
  getOrCreateClientPortalLink,
  mintClientPortalLink,
  type IResolvedClientPortalLink,
} from './issuePortalLink.js';
import { linkBlocker } from './redeemPortalLink.js';
import { portalLinkAnchorId } from '../lib/portalTokens.js';
import { makeFakeMagicLinksDb } from './__fixtures__/fakeMagicLinksDb.js';

const WID = 'w1';
const PID = 'p1';
const CID = 'c1';

describe('getOrCreateClientPortalLink — single-winner under a contended first-mint (#142)', () => {
  it('two concurrent first-mints for the SAME triple → ONE active link, SAME token (D-042)', async () => {
    const fake = makeFakeMagicLinksDb();
    let competitor: IResolvedClientPortalLink | undefined;

    // Competitor B commits its mint the instant A first reads the anchor — i.e.
    // between A's read and A's commit — so A's commit sees a stale anchor
    // version, retries, and adopts B's link.
    fake.setContentionHook(async () => {
      competitor = await getOrCreateClientPortalLink(fake.db, WID, PID, CID, 'system');
    });

    const a = await getOrCreateClientPortalLink(fake.db, WID, PID, CID, 'system');

    expect(competitor).toBeDefined();
    expect(competitor?.created).toBe(true); // B won the race and minted
    expect(a.created).toBe(false); // A retried and adopted B's link
    expect(a.token).toBe(competitor?.token); // SAME token — no 404 for in-flight links
    expect(a.linkId).toBe(competitor?.linkId);

    const active = fake.activeClientLinks();
    expect(active).toHaveLength(1); // exactly one active link
    expect(active[0].data['token']).toBe(a.token);
    // The anchor points at the single surviving link.
    expect(fake.store.get(portalLinkAnchorId(WID, PID, CID))?.data['activeLinkId']).toBe(active[0].id);
  });

  it('two DIFFERENT triples do not contend — both mint independently', async () => {
    const fake = makeFakeMagicLinksDb();

    const one = await getOrCreateClientPortalLink(fake.db, WID, PID, CID, 'system');
    const two = await getOrCreateClientPortalLink(fake.db, WID, 'p2', 'c2', 'system');

    expect(one.created).toBe(true);
    expect(two.created).toBe(true);
    expect(one.token).not.toBe(two.token);
    expect(fake.activeClientLinks()).toHaveLength(2);
    // Sanity: the anchor id is per-triple, so the two never share a lock.
    expect(portalLinkAnchorId(WID, PID, CID)).not.toBe(portalLinkAnchorId(WID, 'p2', 'c2'));
  });

  it('anchor pointer doc carries NO redeem/revoke-sweep fields — cannot be swept (#142)', async () => {
    const fake = makeFakeMagicLinksDb();
    await getOrCreateClientPortalLink(fake.db, WID, PID, CID, 'system');

    const anchor = fake.store.get(portalLinkAnchorId(WID, PID, CID));
    expect(anchor?.data['activeLinkId']).toBeDefined();
    // The redeem collection-group query filters on `shortCode`; the
    // deletePersonalData revoke sweep filters on `audience`+`subjectId`+`revoked`
    // (equality filters exclude docs missing the field). Guard that a future edit
    // cannot make the anchor match either path and get returned/revoked.
    for (const field of ['shortCode', 'audience', 'subjectId', 'revoked']) {
      expect(anchor?.data[field]).toBeUndefined();
    }
  });
});

describe('reset after get-or-create — rotates, rejects the prior at redeem (#142)', () => {
  it('mints a new token, soft-revokes + rejects the prior, repoints the anchor', async () => {
    const fake = makeFakeMagicLinksDb();

    const created = await getOrCreateClientPortalLink(fake.db, WID, PID, CID, 'owner-uid');
    const priorLinkId = created.linkId;

    // reset:true funnels through mintClientPortalLink (the rotate path).
    const rotated = await mintClientPortalLink(fake.db, WID, PID, CID, 'owner-uid');
    expect(rotated.token).not.toBe(created.token);

    // Prior link is soft-revoked; redeem's pure gate rejects a revoked link, so
    // the OLD url no longer authorizes (the stored plaintext token cannot help).
    const prior = fake.store.get(priorLinkId);
    expect(prior?.data['revoked']).toBe(true);
    const expiresAt = prior?.data['expiresAt'] as { toMillis: () => number };
    expect(
      linkBlocker(
        {
          audience: prior?.data['audience'],
          scopeType: prior?.data['scopeType'],
          revoked: prior?.data['revoked'],
          expiresAtMs: expiresAt.toMillis(),
        },
        Date.now(),
      ),
    ).toBe('revoked');

    // The anchor now points at the fresh link.
    expect(fake.store.get(portalLinkAnchorId(WID, PID, CID))?.data['activeLinkId']).toBe(
      rotated.linkId,
    );

    // A subsequent get-or-create resurfaces the NEW link, never the rotated one.
    const after = await getOrCreateClientPortalLink(fake.db, WID, PID, CID, 'system');
    expect(after.created).toBe(false);
    expect(after.token).toBe(rotated.token);
    expect(after.linkId).not.toBe(priorLinkId);
  });
});
