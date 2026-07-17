/**
 * #9 role-capability matrix: for each role (owner/admin/pm/viewer) —
 * workspace reads allowed; members/clients/projects/tasks writes denied for
 * ALL roles until #12; auditLog reads gated to owner/admin; auditLog writes
 * denied for everyone. Plus a cross-workspace regression on the #6 isolation
 * invariant.
 */

import { assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import type { RulesTestEnvironment } from '@firebase/rules-unit-testing';
import type { TMemberRole } from '@siapp/shared';
import { deleteDoc, doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';
import { afterAll, beforeAll, describe, it } from 'vitest';
import { createTestEnv, memberClaims, seedWorkspace, workspacePaths } from './helpers.ts';

const WKS_A = 'wksA';
const WKS_B = 'wksB';
const ROLES: TMemberRole[] = ['owner', 'admin', 'pm', 'viewer'];

let testEnv: RulesTestEnvironment;

beforeAll(async () => {
  testEnv = await createTestEnv('siapp-rules-role-capabilities');
  await seedWorkspace(testEnv, WKS_A);
  await seedWorkspace(testEnv, WKS_B);
});

afterAll(async () => {
  await testEnv.cleanup();
});

function dbAs(role: TMemberRole, wid: string = WKS_A) {
  return testEnv.authenticatedContext(`user-${role}`, { ...memberClaims(wid, role) }).firestore();
}

const paths = workspacePaths(WKS_A);

describe.each(ROLES)('role capability matrix — %s', (role) => {
  it('allows reading the workspace doc', async () => {
    await assertSucceeds(getDoc(doc(dbAs(role), paths.workspace)));
  });

  it('allows reading a project doc', async () => {
    await assertSucceeds(getDoc(doc(dbAs(role), paths.project)));
  });

  it('denies member-doc writes (server-side only until #10/#11)', async () => {
    await assertFails(
      setDoc(doc(dbAs(role), `workspaces/${WKS_A}/members/user-${role}`), {
        uid: `user-${role}`,
        role: 'owner',
      }),
    );
    await assertFails(updateDoc(doc(dbAs(role), paths.member), { role: 'owner' }));
  });

  it('denies client writes (write rules land with #12)', async () => {
    await assertFails(setDoc(doc(dbAs(role), `workspaces/${WKS_A}/clients/new`), { name: 'x' }));
    await assertFails(deleteDoc(doc(dbAs(role), paths.client)));
  });

  it('denies project writes (write rules land with #12)', async () => {
    await assertFails(setDoc(doc(dbAs(role), `workspaces/${WKS_A}/projects/new`), { name: 'x' }));
    await assertFails(updateDoc(doc(dbAs(role), paths.project), { name: 'renamed' }));
  });

  it('denies task writes (write rules land with #12)', async () => {
    await assertFails(
      setDoc(doc(dbAs(role), `workspaces/${WKS_A}/projects/proj1/tasks/new`), { title: 'x' }),
    );
    await assertFails(updateDoc(doc(dbAs(role), paths.task), { title: 'renamed' }));
  });

  it('denies auditLog writes (append is server-side only)', async () => {
    await assertFails(
      setDoc(doc(dbAs(role), `workspaces/${WKS_A}/auditLog/forged`), { action: 'x' }),
    );
  });
});

describe('auditLog read gating (owner/admin only)', () => {
  it('allows the owner to read the audit log', async () => {
    await assertSucceeds(getDoc(doc(dbAs('owner'), paths.auditLog)));
  });

  it('allows an admin to read the audit log', async () => {
    await assertSucceeds(getDoc(doc(dbAs('admin'), paths.auditLog)));
  });

  it('denies a pm reading the audit log', async () => {
    await assertFails(getDoc(doc(dbAs('pm'), paths.auditLog)));
  });

  it('denies a viewer reading the audit log', async () => {
    await assertFails(getDoc(doc(dbAs('viewer'), paths.auditLog)));
  });
});

describe('cross-workspace isolation regression (#6 invariant)', () => {
  it('denies a wksB owner reading wksA docs, including the audit log', async () => {
    const intruder = dbAs('owner', WKS_B);
    await assertFails(getDoc(doc(intruder, paths.workspace)));
    await assertFails(getDoc(doc(intruder, paths.auditLog)));
  });

  it('denies a wksB owner writing into wksA', async () => {
    const intruder = dbAs('owner', WKS_B);
    await assertFails(setDoc(doc(intruder, paths.member), { hijacked: true }));
  });
});
