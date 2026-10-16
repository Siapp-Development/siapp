/**
 * sendPortalLink (#137, Part C): the on-demand "Send portal link" callable —
 * the client analog of sendCollaboratorLink. Exercised through the onCall
 * handler (`.run`) against an in-memory Firestore fake so the full gate chain
 * (role → D-027 → opt-out/consent → durable get-or-create → enqueue → audit) is
 * covered without emulators. The durable get-or-create is stubbed here (its own
 * semantics are unit-tested in issuePortalLink's link tests) so these assert the
 * ENQUEUE contract: the snake_case, token-only `variables` map.
 */

import { logger } from 'firebase-functions';
import { HttpsError, type CallableRequest } from 'firebase-functions/v2/https';
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';

const hoisted = vi.hoisted(() => ({
  db: undefined as unknown,
}));

vi.mock('firebase-admin/firestore', () => ({
  Timestamp: {
    now: () => ({ toMillis: () => 1_700_000_000_000, toDate: () => new Date(1_700_000_000_000) }),
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

// Keep the real role gate (requirePortalLinkIssuer) and D-027 gate
// (issueBlocker); stub only the durable get-or-create so we assert the enqueue
// passes the resolved token straight through to `portal_token`.
vi.mock('./issuePortalLink.js', async (importActual) => {
  const actual = await importActual<typeof import('./issuePortalLink.js')>();
  return { ...actual, getOrCreateClientPortalLink: vi.fn() };
});

import { getOrCreateClientPortalLink } from './issuePortalLink.js';
import { mytDateString } from '../lib/quietHours.js';
import { PROJECT_WELCOME_TEMPLATE, sendPortalLink } from './sendPortalLink.js';

const WID = 'w1';
const PID = 'p1';
const CID = 'c1';
const MINTED_TOKEN = 'abcdEFGH2345_c2VjcmV0LXZhbHVlLXRlc3Q';
const EXPIRES = { toDate: () => new Date('2026-06-01T00:00:00.000Z') };

interface ISnap {
  exists: boolean;
  data: () => Record<string, unknown> | undefined;
  get: (field: string) => unknown;
}

function snap(data: Record<string, unknown> | undefined): ISnap {
  return {
    exists: data !== undefined,
    data: () => data,
    get: (field: string) => data?.[field],
  };
}

interface IFakeOpts {
  project?: Record<string, unknown>;
  workspace?: Record<string, unknown>;
  client?: Record<string, unknown>;
}

interface IWrites {
  messages: { id: string; data: Record<string, unknown> }[];
}

function makeDb(opts: IFakeOpts): { db: unknown; writes: IWrites } {
  const writes: IWrites = { messages: [] };
  let auto = 0;
  const messagesCollection = {
    doc: () => {
      const id = `msg${(auto += 1)}`;
      return {
        id,
        set: (data: Record<string, unknown>) => {
          writes.messages.push({ id, data });
          return Promise.resolve();
        },
      };
    },
  };
  const db = {
    doc: (path: string) => ({
      get: () => {
        if (path === `workspaces/${WID}/projects/${PID}`) return Promise.resolve(snap(opts.project));
        if (path === `workspaces/${WID}`) return Promise.resolve(snap(opts.workspace));
        if (path === `workspaces/${WID}/clients/${CID}`) return Promise.resolve(snap(opts.client));
        return Promise.resolve(snap(undefined));
      },
    }),
    collection: (path: string) => {
      if (path === `workspaces/${WID}/messages`) return messagesCollection;
      throw new Error(`unexpected collection ${path}`);
    },
  };
  return { db, writes };
}

function request(
  overrides: {
    role?: string;
    uid?: string;
    noAuth?: boolean;
    data?: Record<string, unknown>;
  } = {},
): CallableRequest {
  const { role = 'owner', uid = 'u-owner', noAuth = false, data } = overrides;
  return {
    data: data ?? { workspaceId: WID, projectId: PID },
    auth: noAuth ? undefined : { uid, token: { workspaces: { [WID]: { role } } } },
  } as unknown as CallableRequest;
}

const resolveFn = getOrCreateClientPortalLink as unknown as Mock;

type TNotSentReason = 'opt_out' | 'no_consent' | 'no_phone' | 'duplicate_phone' | 'no_recipient';

/**
 * #171 (H6): the exact not-sent record for a blocked client — the same
 * envelope as a real send with `portal_token: ''`, `suppressed:true` + reason,
 * and `restrictedToDepartments: []`.
 */
function notSentRecord(
  id: string,
  reason: TNotSentReason,
  expected: { clientId?: string; firstName: string; phone: string; dueDate?: string },
): Record<string, unknown> {
  return {
    id,
    channel: 'whatsapp',
    recipientType: 'client',
    recipientId: expected.clientId ?? CID,
    recipientPhone: expected.phone,
    templateName: PROJECT_WELCOME_TEMPLATE,
    trigger: 'project_welcome',
    variables: {
      firm_name: 'Acme Builders',
      client_first_name: expected.firstName,
      project_title: 'Bungalow Reno',
      project_due_date:
        expected.dueDate ?? mytDateString(new Date('2026-07-15T00:00:00.000Z')),
      portal_token: '',
    },
    status: 'queued',
    costEstimateMyr: 0.1,
    relatedTo: { type: 'project', id: PID },
    createdAt: expect.anything(),
    restrictedToDepartments: [],
    suppressed: true,
    suppressedReason: reason,
  };
}

function expectSingleNotSent(
  writes: IWrites,
  reason: TNotSentReason,
  expected: { clientId?: string; firstName: string; phone: string },
): void {
  expect(writes.messages).toHaveLength(1);
  const { id, data } = writes.messages[0];
  expect(data).toEqual(notSentRecord(id, reason, expected));
}

beforeEach(() => {
  vi.clearAllMocks();
  resolveFn.mockResolvedValue({
    url: `https://siapp.app/p/${MINTED_TOKEN}`,
    token: MINTED_TOKEN,
    expiresAt: EXPIRES,
    linkId: 'link1',
    rotated: false,
    created: true,
  });
});

const PUBLISHED_PROJECT = {
  lifecycle: 'published',
  clientId: CID,
  name: 'Bungalow Reno',
  targetEndDate: { toDate: () => new Date('2026-07-15T00:00:00.000Z') },
};
const WORKSPACE = { name: 'Acme Builders' };
const CONSENTED_CLIENT = {
  name: 'Ahmad Rahman Bin Ismail',
  phone: '+60123456789',
  waConsent: { granted: true },
};

describe('sendPortalLink — argument + role gate', () => {
  it('rejects missing workspaceId/projectId', async () => {
    hoisted.db = makeDb({}).db;
    await expect(sendPortalLink.run(request({ data: { workspaceId: WID } }))).rejects.toThrow(
      /required/i,
    );
  });

  it('rejects an unauthenticated caller', async () => {
    hoisted.db = makeDb({ project: PUBLISHED_PROJECT, workspace: WORKSPACE }).db;
    await expect(sendPortalLink.run(request({ noAuth: true }))).rejects.toThrow(HttpsError);
  });

  it('rejects member / viewer / non-member roles (only owner/admin/pm may issue)', async () => {
    for (const role of ['member', 'viewer', 'no-such-role']) {
      hoisted.db = makeDb({ project: PUBLISHED_PROJECT, workspace: WORKSPACE }).db;
      await expect(sendPortalLink.run(request({ role }))).rejects.toThrow(/role cannot issue/i);
    }
  });

  it('allows owner / admin / pm through the role gate', async () => {
    for (const role of ['owner', 'admin', 'pm']) {
      const { db } = makeDb({
        project: PUBLISHED_PROJECT,
        workspace: WORKSPACE,
        client: CONSENTED_CLIENT,
      });
      hoisted.db = db;
      const result = await sendPortalLink.run(request({ role }));
      expect(result).toMatchObject({ results: [{ status: 'queued' }] });
    }
  });
});

describe('sendPortalLink — D-027 gate', () => {
  it('rejects a missing project (not-found)', async () => {
    hoisted.db = makeDb({ project: undefined, workspace: WORKSPACE }).db;
    await expect(sendPortalLink.run(request())).rejects.toThrow(/not found/i);
  });

  it('rejects a draft project (not-published)', async () => {
    hoisted.db = makeDb({
      project: { lifecycle: 'draft', clientId: CID, name: 'Draft' },
      workspace: WORKSPACE,
    }).db;
    await expect(sendPortalLink.run(request())).rejects.toThrow(/publish the project/i);
  });

  it('rejects a published project with no linked client (no-client)', async () => {
    hoisted.db = makeDb({
      project: { lifecycle: 'published', clientId: '', name: 'P' },
      workspace: WORKSPACE,
    }).db;
    await expect(sendPortalLink.run(request())).rejects.toThrow(/link a client/i);
  });

  it('skips a missing linked client doc (dangling denorm ref) — no send, no error, no result', async () => {
    const { db, writes } = makeDb({
      project: { ...PUBLISHED_PROJECT, clientNameDenorm: 'Ahmad Rahman' },
      workspace: WORKSPACE,
      client: undefined,
    });
    hoisted.db = db;
    expect(await sendPortalLink.run(request())).toEqual({ results: [] });
    // #171: the attempt is logged as no_recipient with an empty phone, and the
    // name comes from the project's denormalized client ref.
    expectSingleNotSent(writes, 'no_recipient', { firstName: 'Ahmad', phone: '' });
    expect(resolveFn).not.toHaveBeenCalled();
  });
});

describe('sendPortalLink — consent / opt-out gates (not-sent record, no enqueue)', () => {
  it('returns opted_out and writes only a not-sent record for an opted-out client', async () => {
    const { db, writes } = makeDb({
      project: PUBLISHED_PROJECT,
      workspace: WORKSPACE,
      client: { name: 'Ahmad', phone: '+60123456789', notificationsOptOut: true },
    });
    hoisted.db = db;

    const result = await sendPortalLink.run(request());

    expect(result).toEqual({ results: [{ clientId: CID, clientName: 'Ahmad', status: 'opted_out' }] });
    expectSingleNotSent(writes, 'opt_out', { firstName: 'Ahmad', phone: '+60123456789' });
    expect(resolveFn).not.toHaveBeenCalled();
    expect(auditMock.writeAuditLog).not.toHaveBeenCalled();
  });

  it('returns no_consent and writes only a not-sent record for a client without waConsent', async () => {
    const { db, writes } = makeDb({
      project: PUBLISHED_PROJECT,
      workspace: WORKSPACE,
      client: { name: 'Ahmad', phone: '+60123456789' },
    });
    hoisted.db = db;

    const result = await sendPortalLink.run(request());

    expect(result).toEqual({ results: [{ clientId: CID, clientName: 'Ahmad', status: 'no_consent' }] });
    expectSingleNotSent(writes, 'no_consent', { firstName: 'Ahmad', phone: '+60123456789' });
    expect(resolveFn).not.toHaveBeenCalled();
    expect(auditMock.writeAuditLog).not.toHaveBeenCalled();
  });

  it('returns no_phone and neither mints nor enqueues for a client with no phone', async () => {
    const { db, writes } = makeDb({
      project: PUBLISHED_PROJECT,
      workspace: WORKSPACE,
      client: { name: 'Ahmad', phone: '', waConsent: { granted: true } },
    });
    hoisted.db = db;

    const result = await sendPortalLink.run(request());

    expect(result).toEqual({ results: [{ clientId: CID, clientName: 'Ahmad', status: 'no_phone' }] });
    expectSingleNotSent(writes, 'no_phone', { firstName: 'Ahmad', phone: '' });
    expect(resolveFn).not.toHaveBeenCalled();
    expect(auditMock.writeAuditLog).not.toHaveBeenCalled();
  });

  it('treats a missing phone field the same as no_phone', async () => {
    const { db, writes } = makeDb({
      project: PUBLISHED_PROJECT,
      workspace: WORKSPACE,
      client: { name: 'Ahmad', waConsent: { granted: true } },
    });
    hoisted.db = db;

    expect(await sendPortalLink.run(request())).toEqual({
      results: [{ clientId: CID, clientName: 'Ahmad', status: 'no_phone' }],
    });
    expectSingleNotSent(writes, 'no_phone', { firstName: 'Ahmad', phone: '' });
    expect(resolveFn).not.toHaveBeenCalled();
  });

  it('treats a whitespace-only phone as no_phone (normalized before the empty gate)', async () => {
    const { db, writes } = makeDb({
      project: PUBLISHED_PROJECT,
      workspace: WORKSPACE,
      client: { name: 'Ahmad', phone: '   ', waConsent: { granted: true } },
    });
    hoisted.db = db;

    expect(await sendPortalLink.run(request())).toEqual({
      results: [{ clientId: CID, clientName: 'Ahmad', status: 'no_phone' }],
    });
    expectSingleNotSent(writes, 'no_phone', { firstName: 'Ahmad', phone: '' });
    expect(resolveFn).not.toHaveBeenCalled();
  });

  it('treats a granted:false refusal record as no_consent', async () => {
    const { db, writes } = makeDb({
      project: PUBLISHED_PROJECT,
      workspace: WORKSPACE,
      client: { name: 'Ahmad', phone: '+60123456789', waConsent: { granted: false } },
    });
    hoisted.db = db;
    expect(await sendPortalLink.run(request())).toEqual({
      results: [{ clientId: CID, clientName: 'Ahmad', status: 'no_consent' }],
    });
    expectSingleNotSent(writes, 'no_consent', { firstName: 'Ahmad', phone: '+60123456789' });
  });

  // Gate-ORDER guards: the no_phone gate must sit AFTER opt-out and consent, so a
  // phone-less recipient who ALSO declined must still report the decline (never
  // no_phone). A phone-less client is used in both cases; the earlier gate wins.
  it('reports opted_out (not no_phone) for a phone-less client who opted out', async () => {
    const { db, writes } = makeDb({
      project: PUBLISHED_PROJECT,
      workspace: WORKSPACE,
      client: { name: 'Ahmad', phone: '', notificationsOptOut: true },
    });
    hoisted.db = db;
    expect(await sendPortalLink.run(request())).toEqual({
      results: [{ clientId: CID, clientName: 'Ahmad', status: 'opted_out' }],
    });
    expectSingleNotSent(writes, 'opt_out', { firstName: 'Ahmad', phone: '' });
    expect(resolveFn).not.toHaveBeenCalled();
  });

  it('reports no_consent (not no_phone) for a phone-less client without consent', async () => {
    const { db, writes } = makeDb({
      project: PUBLISHED_PROJECT,
      workspace: WORKSPACE,
      client: { name: 'Ahmad', phone: '' },
    });
    hoisted.db = db;
    expect(await sendPortalLink.run(request())).toEqual({
      results: [{ clientId: CID, clientName: 'Ahmad', status: 'no_consent' }],
    });
    expectSingleNotSent(writes, 'no_consent', { firstName: 'Ahmad', phone: '' });
    expect(resolveFn).not.toHaveBeenCalled();
  });
});

describe('sendPortalLink — happy path enqueue shape', () => {
  it('enqueues exactly one project_welcome message with the snake_case, token-only variables', async () => {
    const { db, writes } = makeDb({
      project: PUBLISHED_PROJECT,
      workspace: WORKSPACE,
      client: CONSENTED_CLIENT,
    });
    hoisted.db = db;

    const result = await sendPortalLink.run(request());

    // Durable get-or-create against the correct (workspace, project, client).
    expect(resolveFn).toHaveBeenCalledWith(db, WID, PID, CID, 'u-owner');

    expect(result).toEqual({
      results: [
        {
          clientId: CID,
          clientName: 'Ahmad Rahman Bin Ismail',
          status: 'queued',
          expiresAt: '2026-06-01T00:00:00.000Z',
        },
      ],
    });

    expect(writes.messages).toHaveLength(1);
    const message = writes.messages[0].data;
    expect(message).toMatchObject({
      channel: 'whatsapp',
      status: 'queued',
      trigger: 'project_welcome',
      templateName: PROJECT_WELCOME_TEMPLATE,
      recipientType: 'client',
      recipientId: CID,
      recipientPhone: '+60123456789',
      relatedTo: { type: 'project', id: PID },
    });
    expect(message['templateName']).toBe('siapp_project_welcome_v1_en');

    // The exact wire contract: snake_case keys, token-only value set.
    expect(message['variables']).toEqual({
      firm_name: 'Acme Builders',
      client_first_name: 'Ahmad',
      project_title: 'Bungalow Reno',
      project_due_date: mytDateString(new Date('2026-07-15T00:00:00.000Z')),
      portal_token: MINTED_TOKEN,
    });
  });

  it('#171: the queued doc is unchanged apart from restrictedToDepartments: [] (exact snapshot)', async () => {
    const { db, writes } = makeDb({
      project: PUBLISHED_PROJECT,
      workspace: WORKSPACE,
      client: CONSENTED_CLIENT,
    });
    hoisted.db = db;

    await sendPortalLink.run(request());

    expect(writes.messages).toHaveLength(1);
    const { id, data } = writes.messages[0];
    expect(data).toEqual({
      id,
      channel: 'whatsapp',
      recipientPhone: '+60123456789',
      recipientType: 'client',
      recipientId: CID,
      templateName: PROJECT_WELCOME_TEMPLATE,
      // Key set mirrors the approved project_welcome placeholders.
      variables: {
        firm_name: 'Acme Builders',
        client_first_name: 'Ahmad',
        project_title: 'Bungalow Reno',
        project_due_date: mytDateString(new Date('2026-07-15T00:00:00.000Z')),
        portal_token: MINTED_TOKEN,
      },
      status: 'queued',
      trigger: 'project_welcome',
      costEstimateMyr: 0.1,
      relatedTo: { type: 'project', id: PID },
      createdAt: expect.anything(),
      restrictedToDepartments: [],
    });
    expect(data).not.toHaveProperty('suppressed');
    expect(data).not.toHaveProperty('suppressedReason');
  });

  it('emits a BARE portal_token (the fresh mint), never a full URL', async () => {
    const { db, writes } = makeDb({
      project: PUBLISHED_PROJECT,
      workspace: WORKSPACE,
      client: CONSENTED_CLIENT,
    });
    hoisted.db = db;

    await sendPortalLink.run(request());

    const variables = writes.messages[0].data['variables'] as Record<string, string>;
    expect(variables['portal_token']).toBe(MINTED_TOKEN);
    expect(variables['portal_token']).not.toMatch(/^https?:/);
    expect(variables['portal_token']).not.toContain('/p/');
    // {shortCode}_{secret} shape — a shortCode, an underscore, then the secret.
    expect(variables['portal_token']).toMatch(/^[a-zA-Z0-9]{12}_/);
  });

  it('uses the "—" due-date fallback when the project has no targetEndDate', async () => {
    const { db, writes } = makeDb({
      project: { lifecycle: 'published', clientId: CID, name: 'No-due Project' },
      workspace: WORKSPACE,
      client: CONSENTED_CLIENT,
    });
    hoisted.db = db;

    await sendPortalLink.run(request());

    const variables = writes.messages[0].data['variables'] as Record<string, string>;
    expect(variables['project_due_date']).toBe('—');
  });

  it('takes only the FIRST whitespace token as client_first_name', async () => {
    const { db, writes } = makeDb({
      project: PUBLISHED_PROJECT,
      workspace: WORKSPACE,
      client: { name: '  Siti   Nurhaliza Binti  ', phone: '+60111', waConsent: { granted: true } },
    });
    hoisted.db = db;

    await sendPortalLink.run(request());

    const variables = writes.messages[0].data['variables'] as Record<string, string>;
    expect(variables['client_first_name']).toBe('Siti');
  });

  it('writes a portal_link.issue audit entry for a first-ever mint', async () => {
    const { db } = makeDb({
      project: PUBLISHED_PROJECT,
      workspace: WORKSPACE,
      client: CONSENTED_CLIENT,
    });
    hoisted.db = db;

    await sendPortalLink.run(request());

    expect(auditMock.writeAuditLog).toHaveBeenCalledTimes(1);
    expect(auditMock.writeAuditLog).toHaveBeenCalledWith(
      WID,
      expect.objectContaining({
        action: 'portal_link.issue',
        targetType: 'magicLink',
        targetId: 'link1',
        actorId: 'u-owner',
      }),
    );
  });

  it('does NOT audit when re-surfacing an existing durable link (created:false, C-6)', async () => {
    resolveFn.mockResolvedValue({
      url: `https://siapp.app/p/${MINTED_TOKEN}`,
      token: MINTED_TOKEN,
      expiresAt: EXPIRES,
      linkId: 'link2',
      rotated: false,
      created: false,
    });
    const { db, writes } = makeDb({
      project: PUBLISHED_PROJECT,
      workspace: WORKSPACE,
      client: CONSENTED_CLIENT,
    });
    hoisted.db = db;

    const result = await sendPortalLink.run(request());

    // Still enqueues the message (same stable link), but no audit on reuse.
    expect(result).toMatchObject({ results: [{ status: 'queued' }] });
    expect(writes.messages).toHaveLength(1);
    expect(auditMock.writeAuditLog).not.toHaveBeenCalled();
  });
});

// A db fake that resolves multiple client docs by id — for the multi-client
// (D1/D3) fan-out and shared-phone de-dupe (D4) coverage.
function makeMultiDb(opts: {
  project: Record<string, unknown>;
  workspace?: Record<string, unknown>;
  clients: Record<string, Record<string, unknown>>;
  /** #171: reject `set` for suppressed (not-sent) records only. */
  failNotSentWrites?: boolean;
}): { db: unknown; writes: IWrites } {
  const writes: IWrites = { messages: [] };
  let auto = 0;
  const messagesCollection = {
    doc: () => {
      const id = `msg${(auto += 1)}`;
      return {
        id,
        set: (data: Record<string, unknown>) => {
          if (opts.failNotSentWrites === true && data['suppressed'] === true) {
            return Promise.reject(new Error('firestore unavailable'));
          }
          writes.messages.push({ id, data });
          return Promise.resolve();
        },
      };
    },
  };
  const db = {
    doc: (path: string) => ({
      get: () => {
        if (path === `workspaces/${WID}/projects/${PID}`) return Promise.resolve(snap(opts.project));
        if (path === `workspaces/${WID}`) return Promise.resolve(snap(opts.workspace));
        const clientMatch = path.match(new RegExp(`^workspaces/${WID}/clients/(.+)$`));
        if (clientMatch) return Promise.resolve(snap(opts.clients[clientMatch[1]]));
        return Promise.resolve(snap(undefined));
      },
    }),
    collection: (path: string) => {
      if (path === `workspaces/${WID}/messages`) return messagesCollection;
      throw new Error(`unexpected collection ${path}`);
    },
  };
  return { db, writes };
}

describe('sendPortalLink — multi-client fan-out + shared-phone de-dupe (D1/D3/D4)', () => {
  const MULTI_PROJECT = {
    lifecycle: 'published',
    clientId: 'c1',
    clientNameDenorm: 'Ann Lee',
    clientIds: ['c1', 'c2'],
    clients: [
      { id: 'c1', name: 'Ann Lee' },
      { id: 'c2', name: 'Ben Tan' },
    ],
    name: 'Bungalow Reno',
    targetEndDate: { toDate: () => new Date('2026-07-15T00:00:00.000Z') },
  };

  it('mints a link and enqueues one message per consenting client on distinct phones', async () => {
    const { db, writes } = makeMultiDb({
      project: MULTI_PROJECT,
      workspace: WORKSPACE,
      clients: {
        c1: { name: 'Ann Lee', phone: '+60111111111', waConsent: { granted: true } },
        c2: { name: 'Ben Tan', phone: '+60222222222', waConsent: { granted: true } },
      },
    });
    hoisted.db = db;

    const result = await sendPortalLink.run(request());

    // One durable link per client id (links are per-subject).
    expect(resolveFn).toHaveBeenCalledWith(db, WID, PID, 'c1', 'u-owner');
    expect(resolveFn).toHaveBeenCalledWith(db, WID, PID, 'c2', 'u-owner');

    expect(result).toMatchObject({
      results: [
        { clientId: 'c1', clientName: 'Ann Lee', status: 'queued' },
        { clientId: 'c2', clientName: 'Ben Tan', status: 'queued' },
      ],
    });
    expect(writes.messages).toHaveLength(2);
    // Per-recipient personalization — no cross-client name leakage (D9).
    const firstNames = writes.messages.map(
      (m) => (m.data['variables'] as Record<string, string>)['client_first_name'],
    );
    expect(firstNames).toEqual(['Ann', 'Ben']);
  });

  it('de-dupes the WhatsApp SEND when two clients share a normalized phone (D4)', async () => {
    const { db, writes } = makeMultiDb({
      project: MULTI_PROJECT,
      workspace: WORKSPACE,
      clients: {
        c1: { name: 'Ann Lee', phone: '+60123456789', waConsent: { granted: true } },
        c2: { name: 'Ben Tan', phone: '+60123456789', waConsent: { granted: true } },
      },
    });
    hoisted.db = db;

    const result = await sendPortalLink.run(request());

    // First client sends; second (shared phone) is suppressed as duplicate_phone.
    expect(result).toMatchObject({
      results: [
        { clientId: 'c1', clientName: 'Ann Lee', status: 'queued' },
        { clientId: 'c2', clientName: 'Ben Tan', status: 'duplicate_phone' },
      ],
    });
    // Only ONE message actually enqueued to the shared number; #171 logs the
    // second client's attempt as a not-sent duplicate_phone record.
    expect(writes.messages).toHaveLength(2);
    expect(writes.messages[0].data['recipientId']).toBe('c1');
    expect(writes.messages[0].data).not.toHaveProperty('suppressed');
    expect(writes.messages[1].data).toEqual(
      notSentRecord(writes.messages[1].id, 'duplicate_phone', {
        clientId: 'c2',
        firstName: 'Ben',
        phone: '+60123456789',
      }),
    );
    // No link minted for the duplicate.
    expect(resolveFn).toHaveBeenCalledTimes(1);
    expect(resolveFn).not.toHaveBeenCalledWith(db, WID, PID, 'c2', 'u-owner');
  });
});

describe('sendPortalLink — #171 not-sent records (H6)', () => {
  const MIXED_PROJECT = {
    lifecycle: 'published',
    clientId: 'c1',
    clientIds: ['c1', 'c2', 'c3', 'c4', 'c5', 'c6'],
    clients: [
      { id: 'c1', name: 'Ann Lee' },
      { id: 'c2', name: 'Ben Tan' },
      { id: 'c3', name: 'Cai Wong' },
      { id: 'c4', name: 'Dee Ong' },
      { id: 'c5', name: 'Eve Lim' },
      { id: 'c6', name: 'Fay Goh' },
    ],
    name: 'Bungalow Reno',
    targetEndDate: { toDate: () => new Date('2026-07-15T00:00:00.000Z') },
  };
  const MIXED_CLIENTS = {
    c1: { name: 'Ann Lee', phone: '+60111111111', waConsent: { granted: true } },
    c2: { name: 'Ben Tan', phone: '+60222222222', waConsent: { granted: true }, notificationsOptOut: true },
    c3: { name: 'Cai Wong', phone: '+60333333333' },
    c4: { name: 'Dee Ong', phone: '', waConsent: { granted: true } },
    c5: { name: 'Eve Lim', phone: '+60111111111', waConsent: { granted: true } },
    // c6 has no client doc (dangling ref) → no_recipient
  };
  const EXPECTED_RESULTS = [
    {
      clientId: 'c1',
      clientName: 'Ann Lee',
      status: 'queued',
      expiresAt: '2026-06-01T00:00:00.000Z',
    },
    { clientId: 'c2', clientName: 'Ben Tan', status: 'opted_out' },
    { clientId: 'c3', clientName: 'Cai Wong', status: 'no_consent' },
    { clientId: 'c4', clientName: 'Dee Ong', status: 'no_phone' },
    { clientId: 'c5', clientName: 'Eve Lim', status: 'duplicate_phone' },
  ];

  it('writes exactly one not-sent record per gate and returns the unchanged results', async () => {
    const { db, writes } = makeMultiDb({
      project: MIXED_PROJECT,
      workspace: WORKSPACE,
      clients: MIXED_CLIENTS,
    });
    hoisted.db = db;

    const result = await sendPortalLink.run(request());

    expect(result).toEqual({ results: EXPECTED_RESULTS });
    expect(writes.messages).toHaveLength(6);
    const [queued, ...notSent] = writes.messages;
    expect(queued.data).not.toHaveProperty('suppressed');
    expect(queued.data['restrictedToDepartments']).toEqual([]);
    expect(notSent.map((m) => [m.data['recipientId'], m.data['suppressedReason']])).toEqual([
      ['c2', 'opt_out'],
      ['c3', 'no_consent'],
      ['c4', 'no_phone'],
      ['c5', 'duplicate_phone'],
      ['c6', 'no_recipient'],
    ]);
    for (const message of notSent) {
      expect(message.data).toMatchObject({
        suppressed: true,
        status: 'queued',
        restrictedToDepartments: [],
      });
      expect((message.data['variables'] as Record<string, string>)['portal_token']).toBe('');
    }
    // c6 (dangling) has no phone; others keep the normalized phone.
    expect(notSent[4].data['recipientPhone']).toBe('');
    expect(notSent[4].data['variables']).toMatchObject({ client_first_name: 'Fay' });
    // Only the eligible client ever gets a link.
    expect(resolveFn).toHaveBeenCalledTimes(1);
    expect(resolveFn).toHaveBeenCalledWith(db, WID, PID, 'c1', 'u-owner');
  });

  it('fail-soft: throwing not-sent writes never change the results or block the real send', async () => {
    const errorSpy = vi.spyOn(logger, 'error').mockImplementation(() => undefined);
    const { db, writes } = makeMultiDb({
      project: MIXED_PROJECT,
      workspace: WORKSPACE,
      clients: MIXED_CLIENTS,
      failNotSentWrites: true,
    });
    hoisted.db = db;

    await expect(sendPortalLink.run(request())).resolves.toEqual({ results: EXPECTED_RESULTS });
    // Only the queued send was persisted.
    expect(writes.messages).toHaveLength(1);
    expect(writes.messages[0].data['recipientId']).toBe('c1');
    expect(errorSpy).toHaveBeenCalledTimes(5);
    expect(errorSpy).toHaveBeenCalledWith(
      'sendPortalLink: failed to write not-sent message record',
      expect.objectContaining({ workspaceId: WID, messageId: expect.any(String) }),
    );
    errorSpy.mockRestore();
  });

  it('normalizes the not-sent recipientPhone like the queued send (whitespace trimmed)', async () => {
    const { db, writes } = makeDb({
      project: PUBLISHED_PROJECT,
      workspace: WORKSPACE,
      client: { name: 'Ahmad', phone: ' +60123456789 ' },
    });
    hoisted.db = db;
    await sendPortalLink.run(request());
    expectSingleNotSent(writes, 'no_consent', { firstName: 'Ahmad', phone: '+60123456789' });
  });

  it('precondition errors write nothing (args, auth, role, not-found, draft, no client)', async () => {
    const cases: { req: CallableRequest; opts: IFakeOpts }[] = [
      { req: request({ data: { workspaceId: WID } }), opts: {} },
      { req: request({ noAuth: true }), opts: { project: PUBLISHED_PROJECT, workspace: WORKSPACE } },
      { req: request({ role: 'viewer' }), opts: { project: PUBLISHED_PROJECT, workspace: WORKSPACE } },
      { req: request(), opts: { project: undefined, workspace: WORKSPACE } },
      {
        req: request(),
        opts: { project: { lifecycle: 'draft', clientId: CID, name: 'D' }, workspace: WORKSPACE },
      },
      {
        req: request(),
        opts: { project: { lifecycle: 'published', clientId: '', name: 'P' }, workspace: WORKSPACE },
      },
    ];
    for (const { req, opts } of cases) {
      const { db, writes } = makeDb({ ...opts, client: CONSENTED_CLIENT });
      hoisted.db = db;
      await expect(sendPortalLink.run(req)).rejects.toThrow(HttpsError);
      expect(writes.messages).toHaveLength(0);
    }
  });

  it('writes one not-sent record per press (attempt log)', async () => {
    const { db, writes } = makeDb({
      project: PUBLISHED_PROJECT,
      workspace: WORKSPACE,
      client: { name: 'Ahmad', phone: '+60123456789', notificationsOptOut: true },
    });
    hoisted.db = db;
    await sendPortalLink.run(request());
    await sendPortalLink.run(request());
    expect(writes.messages.map((m) => m.data['suppressedReason'])).toEqual(['opt_out', 'opt_out']);
  });
});
