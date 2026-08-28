/**
 * sendCollaboratorLink (#127 Q-WA / #137 Finding 1-2): the on-demand "Send
 * access link" callable. Exercised through the onCall handler (`.run`) against
 * an in-memory Firestore fake. The durable get-or-create mint is stubbed (its
 * own semantics live in issueCollaboratorLink's tests) so these assert the
 * ENQUEUE contract — specifically that #137 migrated the emitted `variables`
 * map to snake_case + a token-only `access_token` (bare token, not a URL).
 */

import { HttpsError, type CallableRequest } from 'firebase-functions/v2/https';
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';

const hoisted = vi.hoisted(() => ({ db: undefined as unknown }));

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

// Keep the real role gate; stub only the durable mint so we assert the enqueue
// forwards the bare token straight into `access_token`.
vi.mock('./issueCollaboratorLink.js', async (importActual) => {
  const actual = await importActual<typeof import('./issueCollaboratorLink.js')>();
  return { ...actual, getOrCreateCollaboratorLink: vi.fn() };
});

import { getOrCreateCollaboratorLink } from './issueCollaboratorLink.js';
import { COLLAB_ACCESS_LINK_TEMPLATE, sendCollaboratorLink } from './sendCollaboratorLink.js';

const WID = 'w1';
const COL = 'col1';
const MINTED_TOKEN = 'abcdEFGH2345_dG9rZW4tdmFsdWUtdGVzdA';
const EXPIRES = { toDate: () => new Date('2026-06-01T00:00:00.000Z') };

interface ISnap {
  exists: boolean;
  data: () => Record<string, unknown> | undefined;
  get: (field: string) => unknown;
}

function snap(data: Record<string, unknown> | undefined): ISnap {
  return { exists: data !== undefined, data: () => data, get: (field: string) => data?.[field] };
}

interface IWrites {
  messages: { id: string; data: Record<string, unknown> }[];
}

function makeDb(opts: {
  collaborator?: Record<string, unknown>;
  workspace?: Record<string, unknown>;
}): { db: unknown; writes: IWrites } {
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
        if (path === `workspaces/${WID}/collaborators/${COL}`)
          return Promise.resolve(snap(opts.collaborator));
        if (path === `workspaces/${WID}`) return Promise.resolve(snap(opts.workspace));
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
  overrides: { role?: string; uid?: string; noAuth?: boolean; data?: Record<string, unknown> } = {},
): CallableRequest {
  const { role = 'owner', uid = 'u-owner', noAuth = false, data } = overrides;
  return {
    data: data ?? { workspaceId: WID, collaboratorId: COL },
    auth: noAuth ? undefined : { uid, token: { workspaces: { [WID]: { role } } } },
  } as unknown as CallableRequest;
}

const mintFn = getOrCreateCollaboratorLink as unknown as Mock;

const WORKSPACE = { name: 'Acme Builders' };
const CONSENTED_COLLAB = {
  name: 'Lim Electrical',
  phone: '+60123456789',
  waConsent: { granted: true },
};

beforeEach(() => {
  vi.clearAllMocks();
  mintFn.mockResolvedValue({
    url: `https://siapp.app/t/${MINTED_TOKEN}`,
    token: MINTED_TOKEN,
    expiresAt: EXPIRES,
    linkId: 'link1',
    created: false,
  });
});

describe('sendCollaboratorLink — gates', () => {
  it('rejects missing ids', async () => {
    hoisted.db = makeDb({}).db;
    await expect(
      sendCollaboratorLink.run(request({ data: { workspaceId: WID } })),
    ).rejects.toThrow(/required/i);
  });

  it('rejects an unauthenticated caller', async () => {
    hoisted.db = makeDb({ collaborator: CONSENTED_COLLAB, workspace: WORKSPACE }).db;
    await expect(sendCollaboratorLink.run(request({ noAuth: true }))).rejects.toThrow(HttpsError);
  });

  it('rejects member / viewer / non-issuer roles', async () => {
    for (const role of ['member', 'viewer', 'no-such-role']) {
      hoisted.db = makeDb({ collaborator: CONSENTED_COLLAB, workspace: WORKSPACE }).db;
      await expect(sendCollaboratorLink.run(request({ role }))).rejects.toThrow(/role cannot issue/i);
    }
  });

  it('rejects a missing collaborator', async () => {
    hoisted.db = makeDb({ collaborator: undefined, workspace: WORKSPACE }).db;
    await expect(sendCollaboratorLink.run(request())).rejects.toThrow(/not found/i);
  });

  it('returns opted_out and enqueues nothing for an opted-out collaborator', async () => {
    const { db, writes } = makeDb({
      collaborator: { name: 'Lim', notificationsOptOut: true },
      workspace: WORKSPACE,
    });
    hoisted.db = db;
    expect(await sendCollaboratorLink.run(request())).toEqual({ status: 'opted_out' });
    expect(writes.messages).toHaveLength(0);
    expect(mintFn).not.toHaveBeenCalled();
  });

  it('returns no_phone and neither mints nor enqueues for a collaborator with no phone', async () => {
    const { db, writes } = makeDb({
      collaborator: { name: 'Lim', phone: '', waConsent: { granted: true } },
      workspace: WORKSPACE,
    });
    hoisted.db = db;
    expect(await sendCollaboratorLink.run(request())).toEqual({ status: 'no_phone' });
    expect(writes.messages).toHaveLength(0);
    expect(mintFn).not.toHaveBeenCalled();
    expect(auditMock.writeAuditLog).not.toHaveBeenCalled();
  });

  it('treats a missing phone field the same as no_phone', async () => {
    const { db, writes } = makeDb({
      collaborator: { name: 'Lim', waConsent: { granted: true } },
      workspace: WORKSPACE,
    });
    hoisted.db = db;
    expect(await sendCollaboratorLink.run(request())).toEqual({ status: 'no_phone' });
    expect(writes.messages).toHaveLength(0);
    expect(mintFn).not.toHaveBeenCalled();
  });

  it('returns no_consent and enqueues nothing without a waConsent grant', async () => {
    const { db, writes } = makeDb({
      collaborator: { name: 'Lim', phone: '+60123' },
      workspace: WORKSPACE,
    });
    hoisted.db = db;
    expect(await sendCollaboratorLink.run(request())).toEqual({ status: 'no_consent' });
    expect(writes.messages).toHaveLength(0);
  });

  // Gate-ORDER guards: no_phone must sit AFTER opt-out and consent. The opted_out
  // case above already uses a phone-LESS collaborator (proving opt-out wins over
  // no_phone); this pins the same precedence for the consent gate.
  it('reports no_consent (not no_phone) for a phone-less collaborator without consent', async () => {
    const { db, writes } = makeDb({
      collaborator: { name: 'Lim', phone: '' },
      workspace: WORKSPACE,
    });
    hoisted.db = db;
    expect(await sendCollaboratorLink.run(request())).toEqual({ status: 'no_consent' });
    expect(writes.messages).toHaveLength(0);
    expect(mintFn).not.toHaveBeenCalled();
  });
});

describe('sendCollaboratorLink — happy path enqueue shape (#137)', () => {
  it('enqueues one collab_access_link message with snake_case, token-only variables', async () => {
    const { db, writes } = makeDb({ collaborator: CONSENTED_COLLAB, workspace: WORKSPACE });
    hoisted.db = db;

    const result = await sendCollaboratorLink.run(request());

    expect(result).toEqual({ status: 'queued', expiresAt: '2026-06-01T00:00:00.000Z' });
    expect(writes.messages).toHaveLength(1);
    const message = writes.messages[0].data;
    expect(message).toMatchObject({
      channel: 'whatsapp',
      status: 'queued',
      trigger: 'collab_access_link',
      templateName: COLLAB_ACCESS_LINK_TEMPLATE,
      recipientType: 'collaborator',
      recipientId: COL,
    });

    // #137: snake_case keys, token-only value set (was { firmName, collaboratorName, accessLink }).
    expect(message['variables']).toEqual({
      firm_name: 'Acme Builders',
      collaborator_name: 'Lim Electrical',
      access_token: MINTED_TOKEN,
    });
  });

  it('emits a BARE access_token, never a full URL', async () => {
    const { db, writes } = makeDb({ collaborator: CONSENTED_COLLAB, workspace: WORKSPACE });
    hoisted.db = db;

    await sendCollaboratorLink.run(request());

    const variables = writes.messages[0].data['variables'] as Record<string, string>;
    expect(variables['access_token']).toBe(MINTED_TOKEN);
    expect(variables['access_token']).not.toMatch(/^https?:/);
    expect(variables['access_token']).not.toContain('/t/');
    expect(variables['access_token']).toMatch(/^[a-zA-Z0-9]{12}_/);
  });

  it('does not audit when re-surfacing an existing durable link (created:false)', async () => {
    const { db } = makeDb({ collaborator: CONSENTED_COLLAB, workspace: WORKSPACE });
    hoisted.db = db;
    await sendCollaboratorLink.run(request());
    expect(auditMock.writeAuditLog).not.toHaveBeenCalled();
  });

  it('audits collab_link.issue on a first-ever mint (created:true)', async () => {
    mintFn.mockResolvedValue({
      url: `https://siapp.app/t/${MINTED_TOKEN}`,
      token: MINTED_TOKEN,
      expiresAt: EXPIRES,
      linkId: 'link1',
      created: true,
    });
    const { db } = makeDb({ collaborator: CONSENTED_COLLAB, workspace: WORKSPACE });
    hoisted.db = db;
    await sendCollaboratorLink.run(request());
    expect(auditMock.writeAuditLog).toHaveBeenCalledWith(
      WID,
      expect.objectContaining({ action: 'collab_link.issue', targetId: 'link1' }),
    );
  });
});
