/**
 * #142 (Part B): end-to-end coverage of the issuePortalLink CALLABLE (the onCall
 * handler) against the shared in-memory magicLinks fake — the pure gate/helper
 * tests live in issuePortalLink.test.ts. This proves the two audit behaviours
 * the durable refactor introduced:
 *
 *  - default (get-or-create) mints ONCE and audits `portal_link.issue` on the
 *    first create, and does NOT audit when it re-surfaces an existing link; and
 *  - `reset:true` ROTATES (revokes prior + mints fresh) and audits
 *    `portal_link.reset`.
 *
 * It also asserts the one-active-link invariant survives a first-mint race: the
 * anchor-first transaction means a second mint observes the first's committed
 * link and revokes it, so exactly one active link remains (D-042).
 */

import { type CallableRequest } from 'firebase-functions/v2/https';
import { beforeEach, describe, expect, it, vi } from 'vitest';

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

const hoisted = vi.hoisted(() => ({ db: undefined as unknown }));

import { issuePortalLink, mintClientPortalLink } from './issuePortalLink.js';
import { portalLinkAnchorId } from '../lib/portalTokens.js';
import { makeFakeMagicLinksDb } from './__fixtures__/fakeMagicLinksDb.js';

const WID = 'w1';
const PID = 'p1';
const CID = 'c1';
const PUBLISHED_PROJECT = { lifecycle: 'published', clientId: CID };

function request(data: Record<string, unknown>, role = 'owner', uid = 'u-owner'): CallableRequest {
  return {
    data,
    auth: { uid, token: { workspaces: { [WID]: { role } } } },
  } as unknown as CallableRequest;
}

function activeClientLink(id: string, overrides: Record<string, unknown> = {}) {
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
      expiresAt: {
        toMillis: () => Date.now() + 1_000_000,
        toDate: () => new Date(Date.now() + 1_000_000),
      },
      ...overrides,
    },
  };
}

function anchorFor(activeLinkId: string) {
  return {
    id: portalLinkAnchorId(WID, PID, CID),
    data: { kind: 'portal-anchor', activeLinkId, workspaceId: WID, projectId: PID, clientId: CID },
  };
}

const PROJECT_PATH = `workspaces/${WID}/projects/${PID}`;

beforeEach(() => {
  vi.clearAllMocks();
});

describe('issuePortalLink callable — default get-or-create audit (#142)', () => {
  it('mints a fresh link and audits portal_link.issue on first create', async () => {
    const fake = makeFakeMagicLinksDb({ pathDocs: { [PROJECT_PATH]: PUBLISHED_PROJECT } });
    hoisted.db = fake.db;

    const result = (await issuePortalLink.run(
      request({ workspaceId: WID, projectId: PID }),
    )) as Record<string, unknown>;

    expect(result['url']).toMatch(/\/p\/[a-zA-Z0-9]{12}_/);
    expect(fake.activeClientLinks()).toHaveLength(1);
    expect(auditMock.writeAuditLog).toHaveBeenCalledTimes(1);
    expect(auditMock.writeAuditLog).toHaveBeenCalledWith(
      WID,
      expect.objectContaining({
        action: 'portal_link.issue',
        targetType: 'magicLink',
        actorId: 'u-owner',
      }),
    );
  });

  it('re-surfaces an existing durable link WITHOUT auditing (idempotent Copy)', async () => {
    const existing = activeClientLink('link-existing');
    const fake = makeFakeMagicLinksDb({
      links: [existing, anchorFor('link-existing')],
      pathDocs: { [PROJECT_PATH]: PUBLISHED_PROJECT },
    });
    hoisted.db = fake.db;

    const result = (await issuePortalLink.run(
      request({ workspaceId: WID, projectId: PID }),
    )) as Record<string, unknown>;

    expect(result['url']).toMatch(/\/p\/link-existingshortcode_secretvalue$/);
    expect(fake.activeClientLinks()).toHaveLength(1);
    expect(auditMock.writeAuditLog).not.toHaveBeenCalled();
  });
});

describe('issuePortalLink callable — reset:true rotate (#142)', () => {
  it('revokes the prior active link, mints a fresh one, and audits portal_link.reset', async () => {
    const prior = activeClientLink('link-prior');
    const fake = makeFakeMagicLinksDb({
      links: [prior, anchorFor('link-prior')],
      pathDocs: { [PROJECT_PATH]: PUBLISHED_PROJECT },
    });
    hoisted.db = fake.db;

    const result = (await issuePortalLink.run(
      request({ workspaceId: WID, projectId: PID, reset: true }),
    )) as Record<string, unknown>;

    expect(fake.store.get('link-prior')?.data['revoked']).toBe(true);
    const active = fake.activeClientLinks();
    expect(active).toHaveLength(1);
    expect(active[0].id).not.toBe('link-prior');
    // The anchor now points at the fresh link (not the revoked prior).
    expect(fake.store.get(portalLinkAnchorId(WID, PID, CID))?.data['activeLinkId']).toBe(active[0].id);
    expect(result['url']).toMatch(/\/p\/[a-zA-Z0-9]{12}_/);

    expect(auditMock.writeAuditLog).toHaveBeenCalledTimes(1);
    expect(auditMock.writeAuditLog).toHaveBeenCalledWith(
      WID,
      expect.objectContaining({
        action: 'portal_link.reset',
        targetType: 'magicLink',
        actorId: 'u-owner',
      }),
    );
  });

  it('reset on a project with no existing link still mints + audits portal_link.reset', async () => {
    const fake = makeFakeMagicLinksDb({ pathDocs: { [PROJECT_PATH]: PUBLISHED_PROJECT } });
    hoisted.db = fake.db;

    await issuePortalLink.run(request({ workspaceId: WID, projectId: PID, reset: true }));

    expect(fake.activeClientLinks()).toHaveLength(1);
    expect(auditMock.writeAuditLog).toHaveBeenCalledWith(
      WID,
      expect.objectContaining({ action: 'portal_link.reset' }),
    );
  });
});

describe('mintClientPortalLink — one-active-link invariant under a first-mint race (#142)', () => {
  it('a second mint revokes the first via the anchor so exactly one active link remains', async () => {
    // Two get-or-create branches that BOTH minted (concurrent first-mint). Each
    // mint runs the anchor-first transaction; the second reads the anchor the
    // first committed, revokes its link and repoints — convergence to a single
    // active link (D-042).
    const fake = makeFakeMagicLinksDb({ pathDocs: { [PROJECT_PATH]: PUBLISHED_PROJECT } });

    const first = await mintClientPortalLink(fake.db, WID, PID, CID, 'system');
    const second = await mintClientPortalLink(fake.db, WID, PID, CID, 'system');

    expect(first.token).not.toBe(second.token);
    const active = fake.activeClientLinks();
    expect(active).toHaveLength(1);
    expect(active[0].data['token']).toBe(second.token);
    expect([...fake.store.values()].filter((d) => d.data['revoked'] === true)).toHaveLength(1);
    // The anchor points at the surviving (second) link.
    expect(fake.store.get(portalLinkAnchorId(WID, PID, CID))?.data['activeLinkId']).toBe(active[0].id);
  });
});
