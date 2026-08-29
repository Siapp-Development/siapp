/**
 * #142 (Part B, Tester): the durable client portal link now stores the raw
 * `token` plaintext on its magicLink doc. This test PROVES the stored token
 * never weakens redemption — `redeemPortalLink` verifies ONLY against
 * `secretHash`, exactly as before Part B:
 *
 *  - a doc whose stored `token` is GARBAGE but whose `secretHash` matches the
 *    presented secret still redeems (the token field is never read for auth); and
 *  - a doc whose stored `token` looks correct but whose `secretHash` does NOT
 *    match still fails — a stored token can never authorize a redemption.
 *
 * These run the onCall handler against an in-memory Firestore/Auth fake so the
 * real `parsePortalToken`/`verifySecret` crypto is exercised end-to-end.
 */

import { type CallableRequest } from 'firebase-functions/v2/https';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { generatePortalToken, hashSecret, portalUid } from '../lib/portalTokens.js';

const createCustomToken = vi.hoisted(() => vi.fn(() => Promise.resolve('custom-token-xyz')));
vi.mock('firebase-admin/auth', () => ({ getAuth: () => ({ createCustomToken }) }));

const hoisted = vi.hoisted(() => ({ db: undefined as unknown }));
vi.mock('firebase-admin/firestore', () => ({
  getFirestore: () => hoisted.db,
  FieldValue: { increment: (n: number) => ({ __inc: n }), serverTimestamp: () => '<ts>' },
}));

import { redeemPortalLink } from './redeemPortalLink.js';

const WID = 'w1';
const PID = 'p1';
const CID = 'c1';

interface ISnap {
  exists: boolean;
  data: () => Record<string, unknown> | undefined;
  get: (field: string) => unknown;
}

function snap(data: Record<string, unknown> | undefined): ISnap {
  return { exists: data !== undefined, data: () => data, get: (f: string) => data?.[f] };
}

interface IFakeOpts {
  link: Record<string, unknown> | undefined;
  project: Record<string, unknown> | undefined;
  workspace: Record<string, unknown> | undefined;
}

function makeDb(opts: IFakeOpts): { db: unknown; update: ReturnType<typeof vi.fn> } {
  const update = vi.fn(() => Promise.resolve());
  const workspaceRef = { id: WID, get: () => Promise.resolve(snap(opts.workspace)) };
  const linkSnap =
    opts.link === undefined
      ? null
      : {
          id: 'clientlink1',
          get: (field: string) => opts.link?.[field],
          ref: { parent: { parent: workspaceRef }, update },
        };
  const query = {
    where: () => query,
    limit: () => query,
    get: () => Promise.resolve({ empty: linkSnap === null, docs: linkSnap === null ? [] : [linkSnap] }),
  };
  const db = {
    collectionGroup: () => query,
    doc: (path: string) => ({
      get: () =>
        Promise.resolve(snap(path === `workspaces/${WID}/projects/${PID}` ? opts.project : undefined)),
    }),
  };
  return { db, update };
}

const FUTURE = { toMillis: () => Date.now() + 1_000_000 };
const PUBLISHED_PROJECT = { lifecycle: 'published' };
const WORKSPACE = { name: 'Acme Builders', plan: 'standard', branding: {} };

function request(token: string): CallableRequest {
  return { data: { token } } as unknown as CallableRequest;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('redeemPortalLink — durable stored token never weakens auth (#142)', () => {
  it('redeems on a correct secretHash EVEN when the stored token field is garbage', async () => {
    const { shortCode, secret, token } = generatePortalToken();
    const { db, update } = makeDb({
      link: {
        shortCode,
        // Stored token is intentionally NOT the real token — redemption must
        // ignore it and verify only the SHA-256 secretHash.
        token: 'GARBAGE_not-a-valid-token_zzzzzzzzzzzzzzzzzzzz',
        secretHash: hashSecret(secret),
        audience: 'client',
        scopeType: 'project',
        revoked: false,
        expiresAt: FUTURE,
        scopeId: PID,
        subjectId: CID,
      },
      project: PUBLISHED_PROJECT,
      workspace: WORKSPACE,
    });
    hoisted.db = db;

    const result = (await redeemPortalLink.run(request(token))) as Record<string, unknown>;

    expect(result).toMatchObject({ status: 'ok', workspaceId: WID, projectId: PID });
    expect(createCustomToken).toHaveBeenCalledWith(
      portalUid(WID, PID, CID),
      expect.objectContaining({ portal: expect.objectContaining({ wid: WID, pid: PID, cid: CID }) }),
    );
    // Redemption side effect still recorded (useCount increment) on success.
    expect(update).toHaveBeenCalledTimes(1);
  });

  it('FAILS on a wrong secretHash even when the stored token exactly matches the presented one', async () => {
    const { shortCode, token } = generatePortalToken();
    const { db, update } = makeDb({
      link: {
        shortCode,
        // The stored token is the REAL, matching token — yet it must not be able
        // to authorize when the secretHash is for a different secret.
        token,
        secretHash: hashSecret('an-entirely-different-secret'),
        audience: 'client',
        scopeType: 'project',
        revoked: false,
        expiresAt: FUTURE,
        scopeId: PID,
        subjectId: CID,
      },
      project: PUBLISHED_PROJECT,
      workspace: WORKSPACE,
    });
    hoisted.db = db;

    await expect(redeemPortalLink.run(request(token))).rejects.toMatchObject({
      details: { code: 'portal/invalid_or_expired' },
    });
    expect(createCustomToken).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });
});
