/**
 * Siapp internal-admin (isAdmin claim) access rules:
 *   1. Admin can get a single workspace doc and list the workspaces collection
 *      (WorkspaceListPage / WorkspaceDetailPage read directly from Firestore).
 *   2. Admin reads of adminLog are allowed; writes denied.
 *   3. Admin claim grants NO write access anywhere and NO access to
 *      server-only collections (magicLinks, phoneIndex).
 *   4. A firm member without isAdmin cannot list all workspaces.
 */

import { assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import type { RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { collection, doc, getDoc, getDocs, setDoc, updateDoc } from 'firebase/firestore';
import { afterAll, beforeAll, describe, it } from 'vitest';

import { createTestEnv, memberClaims, seedWorkspace, workspacePaths } from './helpers.ts';

const WKS_A = 'wksA';
const WKS_B = 'wksB';
const ADMIN_UID = 'siapp-admin';
const MEMBER_UID = 'alice';

let testEnv: RulesTestEnvironment;

beforeAll(async () => {
  testEnv = await createTestEnv('siapp-rules-admin-access');
  await seedWorkspace(testEnv, WKS_A);
  await seedWorkspace(testEnv, WKS_B);
});

afterAll(async () => {
  await testEnv.cleanup();
});

function adminDb() {
  // Internal admin with NO workspace memberships — the real shape after the
  // setAdminClaim.ts bootstrap script.
  return testEnv.authenticatedContext(ADMIN_UID, { isAdmin: true }).firestore();
}

function memberDb() {
  return testEnv.authenticatedContext(MEMBER_UID, { ...memberClaims(WKS_A) }).firestore();
}

describe('internal admin workspace reads', () => {
  it('allows getting a single workspace doc', async () => {
    await assertSucceeds(getDoc(doc(adminDb(), workspacePaths(WKS_A).workspace)));
  });

  it('allows listing the workspaces collection', async () => {
    await assertSucceeds(getDocs(collection(adminDb(), 'workspaces')));
  });

  it('allows reading adminLog', async () => {
    await assertSucceeds(getDocs(collection(adminDb(), 'adminLog')));
  });
});

describe('internal admin claim does not grant writes or server-only reads', () => {
  it('denies writing a workspace doc', async () => {
    await assertFails(updateDoc(doc(adminDb(), workspacePaths(WKS_A).workspace), { plan: 'business' }));
  });

  it('denies writing adminLog', async () => {
    await assertFails(setDoc(doc(adminDb(), 'adminLog/forged'), { action: 'forged' }));
  });

  it('denies reading magicLinks', async () => {
    await assertFails(getDoc(doc(adminDb(), workspacePaths(WKS_A).magicLink)));
  });

  it('denies reading phoneIndex', async () => {
    await assertFails(getDoc(doc(adminDb(), 'phoneIndex/+60123456789')));
  });
});

describe('non-admin firm member', () => {
  it('cannot list all workspaces', async () => {
    await assertFails(getDocs(collection(memberDb(), 'workspaces')));
  });

  it('cannot read another workspace doc', async () => {
    await assertFails(getDoc(doc(memberDb(), workspacePaths(WKS_B).workspace)));
  });

  it('cannot read adminLog', async () => {
    await assertFails(getDocs(collection(memberDb(), 'adminLog')));
  });
});
