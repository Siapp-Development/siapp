/**
 * #26 PDPA rules: the firm-attested waConsent field (D1) on clients and
 * collaborators — exact shape, caller-attested recordedBy, never removable —
 * and the server-only pdpaErased marker (D3): firms can neither write it nor
 * touch an erased (frozen) doc again, so un-erasing is impossible
 * client-side.
 */

import { assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import type { RulesTestEnvironment } from '@firebase/rules-unit-testing';
import type { TMemberRole } from '@siapp/shared';
import { Timestamp, deleteField, doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';
import { afterAll, beforeAll, describe, it } from 'vitest';
import { createTestEnv, memberClaims, seedDoc, seedWorkspace } from './helpers.ts';

const WID = 'wks-pdpa-1';
const CLIENT = `workspaces/${WID}/clients/client-pdpa-1`;
const ERASED_CLIENT = `workspaces/${WID}/clients/client-pdpa-erased`;
const COLLAB = `workspaces/${WID}/collaborators/col-pdpa-1`;
const ERASED_COLLAB = `workspaces/${WID}/collaborators/col-pdpa-erased`;

let testEnv: RulesTestEnvironment;

function validConsent(uid: string, overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    granted: true,
    method: 'firm_attested',
    recordedBy: uid,
    recordedAt: Timestamp.now(),
    language: 'en',
    textVersion: 'consent_v1',
    ...overrides,
  };
}

function clientPayload(id: string, uid: string): Record<string, unknown> {
  return {
    id,
    name: 'Aminah binti Ali',
    phone: '+60123456789',
    language: 'en',
    createdAt: Timestamp.now(),
    createdBy: uid,
  };
}

function collaboratorPayload(id: string, uid: string): Record<string, unknown> {
  return {
    id,
    name: 'Lim Contractor',
    phone: '+60198765432',
    type: 'individual',
    status: 'active',
    createdAt: Timestamp.now(),
    invitedBy: uid,
  };
}

beforeAll(async () => {
  testEnv = await createTestEnv('siapp-rules-pdpa');
  await seedWorkspace(testEnv, WID);
  await seedDoc(testEnv, `workspaces/${WID}`, { id: WID, name: 'PDPA Firm' });
  await seedDoc(testEnv, CLIENT, clientPayload('client-pdpa-1', 'user-owner'));
  await seedDoc(testEnv, COLLAB, collaboratorPayload('col-pdpa-1', 'user-owner'));
  // Erased (frozen) docs — anonymized in place by deletePersonalData.
  await seedDoc(testEnv, ERASED_CLIENT, {
    id: 'client-pdpa-erased',
    name: 'Deleted client',
    language: 'en',
    createdAt: Timestamp.now(),
    createdBy: 'user-owner',
    pdpaErased: { requestedBy: 'user-owner', at: Timestamp.now() },
  });
  await seedDoc(testEnv, ERASED_COLLAB, {
    id: 'col-pdpa-erased',
    name: 'Deleted collaborator',
    type: 'individual',
    status: 'archived',
    createdAt: Timestamp.now(),
    invitedBy: 'user-owner',
    pdpaErased: { requestedBy: 'user-owner', at: Timestamp.now() },
  });
});

afterAll(async () => {
  await testEnv.cleanup();
});

function dbAs(role: TMemberRole) {
  return testEnv.authenticatedContext(`user-${role}`, { ...memberClaims(WID, role) }).firestore();
}

describe('waConsent on create (#26 D1)', () => {
  it.each(['owner', 'admin', 'pm'] as const)('%s can create a client with a valid record', async (role) => {
    const uid = `user-${role}`;
    await assertSucceeds(
      setDoc(doc(dbAs(role), `workspaces/${WID}/clients/client-new-${role}`), {
        ...clientPayload(`client-new-${role}`, uid),
        waConsent: validConsent(uid),
      }),
    );
  });

  it('allows create without the field (D2: absent = no consent)', async () => {
    await assertSucceeds(
      setDoc(doc(dbAs('pm'), `workspaces/${WID}/clients/client-noconsent`), {
        ...clientPayload('client-noconsent', 'user-pm'),
      }),
    );
  });

  it('allows a granted:false refusal record', async () => {
    await assertSucceeds(
      setDoc(doc(dbAs('pm'), `workspaces/${WID}/collaborators/col-refused`), {
        ...collaboratorPayload('col-refused', 'user-pm'),
        waConsent: validConsent('user-pm', { granted: false }),
      }),
    );
  });

  it('denies a record attributed to someone else (recordedBy != caller)', async () => {
    await assertFails(
      setDoc(doc(dbAs('pm'), `workspaces/${WID}/clients/client-forged`), {
        ...clientPayload('client-forged', 'user-pm'),
        waConsent: validConsent('user-owner'),
      }),
    );
  });

  it('denies malformed records (missing keys, extra keys, bad values)', async () => {
    const db = dbAs('pm');
    const base = clientPayload('client-bad', 'user-pm');
    const path = `workspaces/${WID}/clients/client-bad`;
    // Missing textVersion.
    const missing = validConsent('user-pm');
    delete missing['textVersion'];
    await assertFails(setDoc(doc(db, path), { ...base, waConsent: missing }));
    // Extra key.
    await assertFails(
      setDoc(doc(db, path), { ...base, waConsent: validConsent('user-pm', { extra: true }) }),
    );
    // Wrong method.
    await assertFails(
      setDoc(doc(db, path), { ...base, waConsent: validConsent('user-pm', { method: 'verbal' }) }),
    );
    // Non-boolean granted.
    await assertFails(
      setDoc(doc(db, path), { ...base, waConsent: validConsent('user-pm', { granted: 'yes' }) }),
    );
    // Bad language.
    await assertFails(
      setDoc(doc(db, path), { ...base, waConsent: validConsent('user-pm', { language: 'fr' }) }),
    );
  });

  it('denies viewers entirely (role gate unchanged)', async () => {
    await assertFails(
      setDoc(doc(dbAs('viewer'), `workspaces/${WID}/clients/client-viewer`), {
        ...clientPayload('client-viewer', 'user-viewer'),
        waConsent: validConsent('user-viewer'),
      }),
    );
  });
});

describe('waConsent on update (#26 D1)', () => {
  it('lets a pm write a fresh consent record on an existing client', async () => {
    await assertSucceeds(
      updateDoc(doc(dbAs('pm'), CLIENT), { waConsent: validConsent('user-pm') }),
    );
  });

  it('lets an admin flip consent to a granted:false refusal on a collaborator', async () => {
    await assertSucceeds(
      updateDoc(doc(dbAs('admin'), COLLAB), {
        waConsent: validConsent('user-admin', { granted: false }),
      }),
    );
  });

  it('denies removing the consent field (withdrawal = fresh granted:false)', async () => {
    await assertFails(updateDoc(doc(dbAs('owner'), CLIENT), { waConsent: deleteField() }));
  });

  it('denies a malformed record on update', async () => {
    await assertFails(
      updateDoc(doc(dbAs('pm'), CLIENT), {
        waConsent: validConsent('user-pm', { method: 'verbal' }),
      }),
    );
  });

  it('still denies notificationsOptOut writes alongside consent (D-035)', async () => {
    await assertFails(
      updateDoc(doc(dbAs('owner'), CLIENT), {
        waConsent: validConsent('user-owner'),
        notificationsOptOut: false,
      }),
    );
  });
});

describe('pdpaErased is server-only and freezes the doc (#26 D3)', () => {
  it('denies writing pdpaErased on create', async () => {
    await assertFails(
      setDoc(doc(dbAs('owner'), `workspaces/${WID}/clients/client-fake-erase`), {
        ...clientPayload('client-fake-erase', 'user-owner'),
        pdpaErased: { requestedBy: 'user-owner', at: Timestamp.now() },
      }),
    );
  });

  it('denies writing pdpaErased on update', async () => {
    await assertFails(
      updateDoc(doc(dbAs('owner'), CLIENT), {
        pdpaErased: { requestedBy: 'user-owner', at: Timestamp.now() },
      }),
    );
  });

  it('denies EVERY update to an erased client — including un-erasing', async () => {
    const db = dbAs('owner');
    await assertFails(updateDoc(doc(db, ERASED_CLIENT), { name: 'Restored name' }));
    await assertFails(updateDoc(doc(db, ERASED_CLIENT), { pdpaErased: deleteField() }));
    await assertFails(updateDoc(doc(db, ERASED_CLIENT), { notes: 'note' }));
  });

  it('denies every update to an erased collaborator (even status)', async () => {
    const db = dbAs('owner');
    await assertFails(updateDoc(doc(db, ERASED_COLLAB), { status: 'active' }));
    await assertFails(updateDoc(doc(db, ERASED_COLLAB), { pdpaErased: deleteField() }));
  });

  it('keeps erased docs readable (anonymized rows still render)', async () => {
    await assertSucceeds(getDoc(doc(dbAs('viewer'), ERASED_CLIENT)));
    await assertSucceeds(getDoc(doc(dbAs('viewer'), ERASED_COLLAB)));
  });

  it('delete stays impossible regardless of erasure', async () => {
    // (Existing posture — hard delete is denied for everyone.)
    const { deleteDoc } = await import('firebase/firestore');
    await assertFails(deleteDoc(doc(dbAs('owner'), ERASED_CLIENT)));
    await assertFails(deleteDoc(doc(dbAs('owner'), CLIENT)));
  });
});
