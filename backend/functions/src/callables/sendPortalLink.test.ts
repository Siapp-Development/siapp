/**
 * sendPortalLink (#137, Part C): the on-demand "Send portal link" callable —
 * the client analog of sendCollaboratorLink. Exercised through the onCall
 * handler (`.run`) against an in-memory Firestore fake so the full gate chain
 * (role → D-027 → opt-out/consent → per-action mint → enqueue → audit) is
 * covered without emulators. The rotate-on-issue mint is stubbed here (its own
 * semantics are unit-tested in issuePortalLink's mint tests) so these assert the
 * ENQUEUE contract: the snake_case, token-only `variables` map.
 */

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
// (issueBlocker); stub only the mint so we assert the enqueue passes the fresh
// token straight through to `portal_token`.
vi.mock('./issuePortalLink.js', async (importActual) => {
  const actual = await importActual<typeof import('./issuePortalLink.js')>();
  return { ...actual, mintClientPortalLink: vi.fn() };
});

import { mintClientPortalLink } from './issuePortalLink.js';
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

const mintFn = mintClientPortalLink as unknown as Mock;

beforeEach(() => {
  vi.clearAllMocks();
  mintFn.mockResolvedValue({
    url: `https://siapp.app/p/${MINTED_TOKEN}`,
    token: MINTED_TOKEN,
    expiresAt: EXPIRES,
    linkId: 'link1',
    rotated: false,
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
      expect(result).toMatchObject({ status: 'queued' });
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

  it('rejects when the linked client doc is missing', async () => {
    hoisted.db = makeDb({ project: PUBLISHED_PROJECT, workspace: WORKSPACE, client: undefined }).db;
    await expect(sendPortalLink.run(request())).rejects.toThrow(/client not found/i);
  });
});

describe('sendPortalLink — consent / opt-out gates (no enqueue)', () => {
  it('returns opted_out and enqueues NOTHING for an opted-out client', async () => {
    const { db, writes } = makeDb({
      project: PUBLISHED_PROJECT,
      workspace: WORKSPACE,
      client: { name: 'Ahmad', phone: '+60123456789', notificationsOptOut: true },
    });
    hoisted.db = db;

    const result = await sendPortalLink.run(request());

    expect(result).toEqual({ status: 'opted_out' });
    expect(writes.messages).toHaveLength(0);
    expect(mintFn).not.toHaveBeenCalled();
    expect(auditMock.writeAuditLog).not.toHaveBeenCalled();
  });

  it('returns no_consent and enqueues NOTHING for a client without waConsent', async () => {
    const { db, writes } = makeDb({
      project: PUBLISHED_PROJECT,
      workspace: WORKSPACE,
      client: { name: 'Ahmad', phone: '+60123456789' },
    });
    hoisted.db = db;

    const result = await sendPortalLink.run(request());

    expect(result).toEqual({ status: 'no_consent' });
    expect(writes.messages).toHaveLength(0);
    expect(mintFn).not.toHaveBeenCalled();
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

    expect(result).toEqual({ status: 'no_phone' });
    expect(writes.messages).toHaveLength(0);
    expect(mintFn).not.toHaveBeenCalled();
    expect(auditMock.writeAuditLog).not.toHaveBeenCalled();
  });

  it('treats a missing phone field the same as no_phone', async () => {
    const { db, writes } = makeDb({
      project: PUBLISHED_PROJECT,
      workspace: WORKSPACE,
      client: { name: 'Ahmad', waConsent: { granted: true } },
    });
    hoisted.db = db;

    expect(await sendPortalLink.run(request())).toEqual({ status: 'no_phone' });
    expect(writes.messages).toHaveLength(0);
    expect(mintFn).not.toHaveBeenCalled();
  });

  it('treats a granted:false refusal record as no_consent', async () => {
    const { db, writes } = makeDb({
      project: PUBLISHED_PROJECT,
      workspace: WORKSPACE,
      client: { name: 'Ahmad', phone: '+60123456789', waConsent: { granted: false } },
    });
    hoisted.db = db;
    expect(await sendPortalLink.run(request())).toEqual({ status: 'no_consent' });
    expect(writes.messages).toHaveLength(0);
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
    expect(await sendPortalLink.run(request())).toEqual({ status: 'opted_out' });
    expect(writes.messages).toHaveLength(0);
    expect(mintFn).not.toHaveBeenCalled();
  });

  it('reports no_consent (not no_phone) for a phone-less client without consent', async () => {
    const { db, writes } = makeDb({
      project: PUBLISHED_PROJECT,
      workspace: WORKSPACE,
      client: { name: 'Ahmad', phone: '' },
    });
    hoisted.db = db;
    expect(await sendPortalLink.run(request())).toEqual({ status: 'no_consent' });
    expect(writes.messages).toHaveLength(0);
    expect(mintFn).not.toHaveBeenCalled();
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

    // Fresh, per-action mint against the correct (workspace, project, client).
    expect(mintFn).toHaveBeenCalledWith(db, WID, PID, CID, 'u-owner');

    expect(result).toEqual({
      status: 'queued',
      expiresAt: '2026-06-01T00:00:00.000Z',
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

  it('audits a rotation as portal_link.reset when a prior link was revoked', async () => {
    mintFn.mockResolvedValue({
      url: `https://siapp.app/p/${MINTED_TOKEN}`,
      token: MINTED_TOKEN,
      expiresAt: EXPIRES,
      linkId: 'link2',
      rotated: true,
    });
    const { db } = makeDb({
      project: PUBLISHED_PROJECT,
      workspace: WORKSPACE,
      client: CONSENTED_CLIENT,
    });
    hoisted.db = db;

    await sendPortalLink.run(request());

    expect(auditMock.writeAuditLog).toHaveBeenCalledWith(
      WID,
      expect.objectContaining({ action: 'portal_link.reset', targetId: 'link2' }),
    );
  });
});
