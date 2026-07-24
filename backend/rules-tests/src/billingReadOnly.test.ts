/**
 * #24 billing read-only gate (D2/D3): `workspaceActive(wid)` denies every
 * firm/portal/collab WRITE while `billingStatus == 'read_only'`, reads stay
 * open, and a MISSING billingStatus (every pre-#24 doc) is treated as
 * active — the backward-compat contract asserted explicitly here.
 */

import { assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import type { RulesTestEnvironment } from '@firebase/rules-unit-testing';
import type { TMemberRole } from '@siapp/shared';
import { Timestamp, doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';
import { afterAll, beforeAll, describe, it } from 'vitest';
import { createTestEnv, memberClaims, seedDoc, seedWorkspace } from './helpers.ts';

// Three workspaces: active (explicit), read-only, and legacy (no field).
const WKS_ACTIVE = 'wks-bill-active';
const WKS_RO = 'wks-bill-ro';
const WKS_LEGACY = 'wks-bill-legacy';
const PROJ = 'proj-bill-1';
const CLIENT_ID = 'client-bill-1';

let testEnv: RulesTestEnvironment;

function projPrefix(wid: string): string {
  return `workspaces/${wid}/projects/${PROJ}`;
}

async function seedBillingWorkspace(wid: string, billingStatus?: string): Promise<void> {
  await seedWorkspace(testEnv, wid);
  await seedDoc(testEnv, `workspaces/${wid}`, {
    id: wid,
    name: `Firm ${wid}`,
    ...(billingStatus !== undefined ? { billingStatus } : {}),
  });
  await seedDoc(testEnv, projPrefix(wid), {
    id: PROJ,
    name: 'Billing project',
    lifecycle: 'published',
    clientId: CLIENT_ID,
  });
  await seedDoc(testEnv, `${projPrefix(wid)}/tasks/task-bill-1`, {
    id: 'task-bill-1',
    title: 'Existing task',
    status: 'todo',
    restrictedToDepartments: [],
    visibleToCollaboratorIds: [],
  });
  await seedDoc(testEnv, `workspaces/${wid}/clients/${CLIENT_ID}`, {
    id: CLIENT_ID,
    name: 'Existing client',
    phone: '+60123456789',
    language: 'en',
    createdAt: Timestamp.now(),
    createdBy: 'user-owner',
  });
  await seedDoc(testEnv, `${projPrefix(wid)}/documents/doc-bill-vis`, {
    visibleToClient: true,
    deletedAt: null,
    restrictedToDepartments: [],
  });
}

beforeAll(async () => {
  testEnv = await createTestEnv('siapp-rules-billing');
  await seedBillingWorkspace(WKS_ACTIVE, 'active');
  await seedBillingWorkspace(WKS_RO, 'read_only');
  await seedBillingWorkspace(WKS_LEGACY);
});

afterAll(async () => {
  await testEnv.cleanup();
});

function dbAs(role: TMemberRole, wid: string) {
  return testEnv
    .authenticatedContext(`user-${role}`, { ...memberClaims(wid, role) })
    .firestore();
}

function dbAsPortal(wid: string) {
  return testEnv
    .authenticatedContext(`portal_${wid}`, {
      portal: { wid, pid: PROJ, cid: CLIENT_ID, linkId: 'link-bill' },
    })
    .firestore();
}

function dbAsCollab(wid: string) {
  return testEnv
    .authenticatedContext(`collab_${wid}`, {
      collab: { wid, pid: PROJ, tid: 'task-bill-1', colid: 'col-bill-1', linkId: 'clink-bill' },
    })
    .firestore();
}

/** A task payload that passes the #13 create rule for `user-<role>`. */
function validTask(wid: string, id: string, creator: string): [string, Record<string, unknown>] {
  return [
    `${projPrefix(wid)}/tasks/${id}`,
    {
      id,
      title: 'Pour foundation',
      status: 'todo',
      assignees: [],
      visibleToClient: false,
      visibleToCollaboratorIds: [],
      restrictedToDepartments: [],
      sendWhatsapp: false,
      dependsOn: [],
      order: 1,
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
      createdBy: creator,
    },
  ];
}

/** A client payload that passes the #16 create rule for `user-<role>`. */
function validClient(wid: string, id: string, creator: string): [string, Record<string, unknown>] {
  return [
    `workspaces/${wid}/clients/${id}`,
    {
      id,
      name: 'New client',
      phone: '+60129876543',
      language: 'en',
      createdAt: Timestamp.now(),
      createdBy: creator,
    },
  ];
}

/** A portal-upload metadata payload that passes validPortalDocumentCreate. */
function portalDoc(wid: string, did: string): [string, Record<string, unknown>] {
  return [
    `${projPrefix(wid)}/documents/${did}`,
    {
      id: did,
      name: 'site-photo.png',
      mimeType: 'image/png',
      sizeBytes: 123456,
      storagePath: `workspaces/${wid}/projects/${PROJ}/client-uploads/uuid-${did}.png`,
      scope: 'project',
      scopeId: PROJ,
      uploadedBy: CLIENT_ID,
      uploaderType: 'client',
      uploadedAt: Timestamp.now(),
      visibleToClient: true,
      visibleToCollaboratorIds: [],
      restrictedToDepartments: [],
      scanStatus: 'pending',
      deletedAt: null,
    },
  ];
}

describe('active workspace (regression: gate must not block normal work)', () => {
  it('allows pm task create and update', async () => {
    const [path, data] = validTask(WKS_ACTIVE, 'task-bill-new', 'user-pm');
    await assertSucceeds(setDoc(doc(dbAs('pm', WKS_ACTIVE), path), data));
    await assertSucceeds(
      updateDoc(doc(dbAs('pm', WKS_ACTIVE), path), {
        status: 'in_progress',
        updatedAt: Timestamp.now(),
        updatedBy: 'user-pm',
      }),
    );
  });

  it('allows admin client create', async () => {
    const [path, data] = validClient(WKS_ACTIVE, 'client-bill-new', 'user-admin');
    await assertSucceeds(setDoc(doc(dbAs('admin', WKS_ACTIVE), path), data));
  });

  it('allows the portal upload create', async () => {
    const [path, data] = portalDoc(WKS_ACTIVE, 'doc-bill-up1');
    await assertSucceeds(setDoc(doc(dbAsPortal(WKS_ACTIVE), path), data));
  });
});

describe('missing billingStatus = active (backward compatibility)', () => {
  it('allows firm writes on a legacy workspace with no billingStatus field', async () => {
    const [taskPath, taskData] = validTask(WKS_LEGACY, 'task-bill-legacy', 'user-owner');
    await assertSucceeds(setDoc(doc(dbAs('owner', WKS_LEGACY), taskPath), taskData));
    const [clientPath, clientData] = validClient(WKS_LEGACY, 'client-bill-legacy', 'user-pm');
    await assertSucceeds(setDoc(doc(dbAs('pm', WKS_LEGACY), clientPath), clientData));
  });
});

describe('read-only workspace: firm writes denied, reads allowed (D2)', () => {
  it('denies task create for pm, admin AND owner', async () => {
    for (const role of ['pm', 'admin', 'owner'] as const) {
      const [path, data] = validTask(WKS_RO, `task-bill-ro-${role}`, `user-${role}`);
      await assertFails(setDoc(doc(dbAs(role, WKS_RO), path), data));
    }
  });

  it('denies task update for the owner', async () => {
    await assertFails(
      updateDoc(doc(dbAs('owner', WKS_RO), `${projPrefix(WKS_RO)}/tasks/task-bill-1`), {
        status: 'done',
        updatedBy: 'user-owner',
      }),
    );
  });

  it('denies project update and client create/update', async () => {
    await assertFails(
      updateDoc(doc(dbAs('owner', WKS_RO), projPrefix(WKS_RO)), { name: 'Renamed' }),
    );
    const [path, data] = validClient(WKS_RO, 'client-bill-ro', 'user-admin');
    await assertFails(setDoc(doc(dbAs('admin', WKS_RO), path), data));
    await assertFails(
      updateDoc(doc(dbAs('admin', WKS_RO), `workspaces/${WKS_RO}/clients/${CLIENT_ID}`), {
        name: 'Renamed client',
      }),
    );
  });

  it('still allows firm member reads — data preserved, read-only', async () => {
    await assertSucceeds(getDoc(doc(dbAs('pm', WKS_RO), projPrefix(WKS_RO))));
    await assertSucceeds(
      getDoc(doc(dbAs('pm', WKS_RO), `${projPrefix(WKS_RO)}/tasks/task-bill-1`)),
    );
    await assertSucceeds(getDoc(doc(dbAs('viewer', WKS_RO), `workspaces/${WKS_RO}`)));
  });
});

describe('read-only workspace: portal/collab reads open, writes blocked (D3)', () => {
  it('still allows the portal to read its project and documents', async () => {
    await assertSucceeds(getDoc(doc(dbAsPortal(WKS_RO), projPrefix(WKS_RO))));
    await assertSucceeds(
      getDoc(doc(dbAsPortal(WKS_RO), `${projPrefix(WKS_RO)}/documents/doc-bill-vis`)),
    );
  });

  it('still allows the collab principal to read its pinned task', async () => {
    await assertSucceeds(
      getDoc(doc(dbAsCollab(WKS_RO), `${projPrefix(WKS_RO)}/tasks/task-bill-1`)),
    );
  });

  it('denies the portal upload create', async () => {
    const [path, data] = portalDoc(WKS_RO, 'doc-bill-up-ro');
    await assertFails(setDoc(doc(dbAsPortal(WKS_RO), path), data));
  });
});

describe('server-only surfaces stay client-write-denied in every state', () => {
  it('denies workspace doc and usageCounters writes even when active', async () => {
    await assertFails(
      updateDoc(doc(dbAs('owner', WKS_ACTIVE), `workspaces/${WKS_ACTIVE}`), {
        billingStatus: 'active',
      }),
    );
    await assertFails(
      setDoc(doc(dbAs('owner', WKS_ACTIVE), `workspaces/${WKS_ACTIVE}/usageCounters/2026-07`), {
        period: '2026-07',
        whatsappConv: 1,
      }),
    );
  });

  it('denies a read-only owner un-flagging their own workspace', async () => {
    await assertFails(
      updateDoc(doc(dbAs('owner', WKS_RO), `workspaces/${WKS_RO}`), { billingStatus: 'active' }),
    );
  });
});
