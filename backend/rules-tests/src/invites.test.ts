/**
 * #11 invite rules: owner/admin may read pending invites; every client
 * write is denied for every role — invite create/accept/revoke/resend run
 * through callables so the raw token never touches the client and member
 * docs stay server-authored.
 */

import { assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import type { RulesTestEnvironment } from '@firebase/rules-unit-testing';
import type { TMemberRole } from '@siapp/shared';
import { Timestamp, collection, deleteDoc, doc, getDoc, getDocs, setDoc, updateDoc } from 'firebase/firestore';
import { afterAll, beforeAll, describe, it } from 'vitest';
import { createTestEnv, memberClaims, seedDoc, seedWorkspace } from './helpers.ts';

const WKS_A = 'wksA';
const WKS_B = 'wksB';
const INVITE_PATH = `workspaces/${WKS_A}/invites/inv1`;
const ROLES: TMemberRole[] = ['owner', 'admin', 'pm', 'viewer'];

let testEnv: RulesTestEnvironment;

beforeAll(async () => {
  testEnv = await createTestEnv('siapp-rules-invites');
  await seedWorkspace(testEnv, WKS_A);
  await seedWorkspace(testEnv, WKS_B);
  await seedDoc(testEnv, INVITE_PATH, {
    id: 'inv1',
    email: 'new.hire@example.com',
    role: 'pm',
    status: 'pending',
    tokenHash: 'a'.repeat(64),
    invitedBy: 'user-owner',
    invitedByNameDenorm: 'Owner',
    createdAt: Timestamp.now(),
    expiresAt: Timestamp.fromMillis(Date.now() + 7 * 24 * 3600 * 1000),
  });
});

afterAll(async () => {
  await testEnv.cleanup();
});

function dbAs(role: TMemberRole, wid: string = WKS_A) {
  return testEnv.authenticatedContext(`user-${role}`, { ...memberClaims(wid, role) }).firestore();
}

describe('invite reads (owner/admin only)', () => {
  it('allows the owner to get and list invites', async () => {
    await assertSucceeds(getDoc(doc(dbAs('owner'), INVITE_PATH)));
    await assertSucceeds(getDocs(collection(dbAs('owner'), `workspaces/${WKS_A}/invites`)));
  });

  it('allows an admin to get and list invites', async () => {
    await assertSucceeds(getDoc(doc(dbAs('admin'), INVITE_PATH)));
    await assertSucceeds(getDocs(collection(dbAs('admin'), `workspaces/${WKS_A}/invites`)));
  });

  it('denies a pm reading invites', async () => {
    await assertFails(getDoc(doc(dbAs('pm'), INVITE_PATH)));
    await assertFails(getDocs(collection(dbAs('pm'), `workspaces/${WKS_A}/invites`)));
  });

  it('denies a viewer reading invites', async () => {
    await assertFails(getDoc(doc(dbAs('viewer'), INVITE_PATH)));
  });

  it('denies another workspace owner reading invites', async () => {
    await assertFails(getDoc(doc(dbAs('owner', WKS_B), INVITE_PATH)));
  });

  it('denies unauthenticated reads', async () => {
    await assertFails(getDoc(doc(testEnv.unauthenticatedContext().firestore(), INVITE_PATH)));
  });
});

describe.each(ROLES)('invite writes denied for every role — %s', (role) => {
  it('denies creating an invite', async () => {
    await assertFails(
      setDoc(doc(dbAs(role), `workspaces/${WKS_A}/invites/forged`), {
        email: 'x@example.com',
        role: 'admin',
        status: 'pending',
      }),
    );
  });

  it('denies mutating an invite (e.g. self-accepting)', async () => {
    await assertFails(updateDoc(doc(dbAs(role), INVITE_PATH), { status: 'accepted' }));
  });

  it('denies deleting an invite', async () => {
    await assertFails(deleteDoc(doc(dbAs(role), INVITE_PATH)));
  });
});
