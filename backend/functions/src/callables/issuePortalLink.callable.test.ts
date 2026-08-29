/**
 * #142 (Part B, Tester): end-to-end coverage of the issuePortalLink CALLABLE
 * (the onCall handler) against a stateful in-memory magicLinks fake — the pure
 * gate/helper tests live in issuePortalLink.test.ts. This proves the two audit
 * behaviours the durable refactor introduced:
 *
 *  - default (get-or-create) mints ONCE and audits `portal_link.issue` on the
 *    first create, and does NOT audit when it re-surfaces an existing link; and
 *  - `reset:true` ROTATES (revokes prior + mints fresh) and audits
 *    `portal_link.reset`.
 *
 * It also asserts the one-active-link invariant survives a concurrent-first-mint
 * race: the transactional mint means a second mint revokes the first, so exactly
 * one active link remains (D-042 / one-active-link).
 */

import { type CallableRequest } from 'firebase-functions/v2/https';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({ db: undefined as unknown }));
vi.mock('firebase-admin/firestore', () => ({
  Timestamp: {
    now: () => ({ toMillis: () => Date.now() }),
    fromMillis: (ms: number) => ({ toMillis: () => ms, toDate: () => new Date(ms) }),
  },
  FieldValue: { serverTimestamp: () => '<serverTimestamp>' },
  getFirestore: () => hoisted.db,
}));

vi.mock('../lib/workspaceStatus.js', () => ({
  assertWorkspaceActive: vi.fn(() => Promise.resolve()),
}));

const auditMock = vi.hoisted(() => ({ writeAuditLog: vi.fn(() => Promise.resolve()) }));
vi.mock('../lib/auditLog.js', () => ({
  writeAuditLog: auditMock.writeAuditLog,
  callableRequestMeta: () => ({ ip: '127.0.0.1', userAgent: 'test' }),
}));

import { issuePortalLink, mintClientPortalLink } from './issuePortalLink.js';

const WID = 'w1';
const PID = 'p1';
const CID = 'c1';
const PUBLISHED_PROJECT = { lifecycle: 'published', clientId: CID };

interface ILinkDoc {
  id: string;
  data: Record<string, unknown>;
}

interface ISnap {
  exists: boolean;
  data: () => Record<string, unknown> | undefined;
  get: (field: string) => unknown;
}

function projectSnap(data: Record<string, unknown> | undefined): ISnap {
  return { exists: data !== undefined, data: () => data, get: (f: string) => data?.[f] };
}

/**
 * Stateful magicLinks fake: a shared `store` of link docs the where-query
 * filters and the transaction mutates, so revoke-then-set is observable.
 */
function makeDb(opts: { project: Record<string, unknown> | undefined; links?: ILinkDoc[] }) {
  const store: ILinkDoc[] = (opts.links ?? []).map((l) => ({ id: l.id, data: { ...l.data } }));
  let auto = 0;

  function docSnap(d: ILinkDoc) {
    return { id: d.id, get: (f: string) => d.data[f], ref: d };
  }
  function makeQuery(constraints: Array<[string, unknown]>) {
    return {
      where: (f: string, _op: string, v: unknown) => makeQuery([...constraints, [f, v]]),
      get: () => {
        const docs = store
          .filter((d) => constraints.every(([f, v]) => d.data[f] === v))
          .map(docSnap);
        return Promise.resolve({ docs, empty: docs.length === 0 });
      },
    };
  }
  const linksRef = {
    where: (f: string, op: string, v: unknown) => makeQuery([]).where(f, op, v),
    doc: () => {
      const d: ILinkDoc = { id: `newlink${(auto += 1)}`, data: {} };
      return d;
    },
  };
  const tx = {
    get: (q: { get: () => Promise<{ docs: unknown[]; empty: boolean }> }) => q.get(),
    update: (ref: ILinkDoc, data: Record<string, unknown>) => {
      Object.assign(ref.data, data);
    },
    set: (ref: ILinkDoc, data: Record<string, unknown>) => {
      ref.data = { ...data };
      store.push(ref);
    },
  };
  const db = {
    doc: (path: string) => ({
      get: () =>
        Promise.resolve(
          projectSnap(path === `workspaces/${WID}/projects/${PID}` ? opts.project : undefined),
        ),
    }),
    collection: () => linksRef,
    runTransaction: (fn: (t: typeof tx) => Promise<unknown>) => fn(tx),
  } as never;
  return { db, store };
}

function request(data: Record<string, unknown>, role = 'owner', uid = 'u-owner'): CallableRequest {
  return { data, auth: { uid, token: { workspaces: { [WID]: { role } } } } } as unknown as CallableRequest;
}

function activeClientLink(id: string, overrides: Record<string, unknown> = {}): ILinkDoc {
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
      expiresAt: { toMillis: () => Date.now() + 1_000_000, toDate: () => new Date(Date.now() + 1_000_000) },
      ...overrides,
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('issuePortalLink callable — default get-or-create audit (#142)', () => {
  it('mints a fresh link and audits portal_link.issue on first create', async () => {
    const { db, store } = makeDb({ project: PUBLISHED_PROJECT, links: [] });
    hoisted.db = db;

    const result = (await issuePortalLink.run(request({ workspaceId: WID, projectId: PID }))) as Record<
      string,
      unknown
    >;

    expect(typeof result['url']).toBe('string');
    expect(result['url']).toMatch(/\/p\/[a-zA-Z0-9]{12}_/);
    expect(store.filter((d) => d.data['revoked'] === false)).toHaveLength(1);
    expect(auditMock.writeAuditLog).toHaveBeenCalledTimes(1);
    expect(auditMock.writeAuditLog).toHaveBeenCalledWith(
      WID,
      expect.objectContaining({ action: 'portal_link.issue', targetType: 'magicLink', actorId: 'u-owner' }),
    );
  });

  it('re-surfaces an existing durable link WITHOUT auditing (idempotent Copy)', async () => {
    const existing = activeClientLink('link-existing');
    const { db, store } = makeDb({ project: PUBLISHED_PROJECT, links: [existing] });
    hoisted.db = db;

    const result = (await issuePortalLink.run(request({ workspaceId: WID, projectId: PID }))) as Record<
      string,
      unknown
    >;

    // Same durable token surfaced, no new doc minted, no audit written on reuse.
    // Origin comes from the PORTAL_ORIGIN param (unset in the unit env); the
    // durable token is re-surfaced unchanged on the /p path.
    expect(result['url']).toMatch(/\/p\/link-existingshortcode_secretvalue$/);
    expect(store).toHaveLength(1);
    expect(auditMock.writeAuditLog).not.toHaveBeenCalled();
  });
});

describe('issuePortalLink callable — reset:true rotate (#142)', () => {
  it('revokes the prior active link, mints a fresh one, and audits portal_link.reset', async () => {
    const prior = activeClientLink('link-prior');
    const { db, store } = makeDb({ project: PUBLISHED_PROJECT, links: [prior] });
    hoisted.db = db;

    const result = (await issuePortalLink.run(
      request({ workspaceId: WID, projectId: PID, reset: true }),
    )) as Record<string, unknown>;

    // Prior revoked, exactly one active link remains (the fresh mint).
    expect(store.find((d) => d.id === 'link-prior')?.data['revoked']).toBe(true);
    const active = store.filter((d) => d.data['revoked'] === false);
    expect(active).toHaveLength(1);
    expect(active[0].id).not.toBe('link-prior');
    expect(result['url']).toMatch(/\/p\/[a-zA-Z0-9]{12}_/);

    expect(auditMock.writeAuditLog).toHaveBeenCalledTimes(1);
    expect(auditMock.writeAuditLog).toHaveBeenCalledWith(
      WID,
      expect.objectContaining({ action: 'portal_link.reset', targetType: 'magicLink', actorId: 'u-owner' }),
    );
  });

  it('reset on a project with no existing link still mints + audits portal_link.reset', async () => {
    const { db, store } = makeDb({ project: PUBLISHED_PROJECT, links: [] });
    hoisted.db = db;

    await issuePortalLink.run(request({ workspaceId: WID, projectId: PID, reset: true }));

    expect(store.filter((d) => d.data['revoked'] === false)).toHaveLength(1);
    expect(auditMock.writeAuditLog).toHaveBeenCalledWith(
      WID,
      expect.objectContaining({ action: 'portal_link.reset' }),
    );
  });
});

describe('mintClientPortalLink — one-active-link invariant under a first-mint race (#142)', () => {
  it('a second mint revokes the first so exactly one active link remains', async () => {
    // Models two get-or-create branches that BOTH decided to mint (concurrent
    // first-mint race). Because each mint runs a transaction that
    // revokes-active-then-sets, the second observes the first's committed link
    // and revokes it — convergence to a single active link (D-042).
    const { db, store } = makeDb({ project: PUBLISHED_PROJECT, links: [] });

    const first = await mintClientPortalLink(db, WID, PID, CID, 'system');
    const second = await mintClientPortalLink(db, WID, PID, CID, 'system');

    expect(first.token).not.toBe(second.token);
    expect(store.filter((d) => d.data['revoked'] === false)).toHaveLength(1);
    expect(store.filter((d) => d.data['revoked'] === true)).toHaveLength(1);
    // The surviving active link is the second mint's.
    expect(store.filter((d) => d.data['revoked'] === false)[0].data['token']).toBe(second.token);
  });
});
