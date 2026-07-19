/**
 * #11 department rules: names are workspace-visible (read for any member);
 * owner/admin create/rename/delete with a field allow-list; memberCount,
 * createdAt and createdBy are locked after create (membership changes go
 * through the setMemberDepartments callable); delete only when empty.
 */

import { assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import type { RulesTestEnvironment } from '@firebase/rules-unit-testing';
import type { TMemberRole } from '@siapp/shared';
import { Timestamp, deleteDoc, doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';
import { createTestEnv, memberClaims, seedDoc, seedWorkspace } from './helpers.ts';

const WKS_A = 'wksA';
const WKS_B = 'wksB';
const DEP_PATH = `workspaces/${WKS_A}/departments/dep-legal`;

let testEnv: RulesTestEnvironment;

beforeAll(async () => {
  testEnv = await createTestEnv('siapp-rules-departments');
  await seedWorkspace(testEnv, WKS_A);
  await seedWorkspace(testEnv, WKS_B);
});

beforeEach(async () => {
  await seedDoc(testEnv, DEP_PATH, validDepartment('dep-legal', { memberCount: 0 }));
});

afterAll(async () => {
  await testEnv.cleanup();
});

function dbAs(role: TMemberRole, wid: string = WKS_A) {
  return testEnv.authenticatedContext(`user-${role}`, { ...memberClaims(wid, role) }).firestore();
}

function validDepartment(id: string, extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id,
    name: 'Legal',
    createdAt: Timestamp.now(),
    createdBy: 'user-owner',
    memberCount: 0,
    ...extra,
  };
}

describe('department reads', () => {
  it('allows every member role to read a department', async () => {
    for (const role of ['owner', 'admin', 'pm', 'viewer'] as const) {
      await assertSucceeds(getDoc(doc(dbAs(role), DEP_PATH)));
    }
  });

  it('denies another workspace member reading departments', async () => {
    await assertFails(getDoc(doc(dbAs('owner', WKS_B), DEP_PATH)));
  });
});

describe('department create', () => {
  it('allows owner and admin to create a valid department', async () => {
    await assertSucceeds(
      setDoc(
        doc(dbAs('owner'), `workspaces/${WKS_A}/departments/dep-own`),
        validDepartment('dep-own', { createdBy: 'user-owner' }),
      ),
    );
    await assertSucceeds(
      setDoc(
        doc(dbAs('admin'), `workspaces/${WKS_A}/departments/dep-adm`),
        validDepartment('dep-adm', { createdBy: 'user-admin', description: 'Contracts', color: '#0f766e' }),
      ),
    );
  });

  it('denies pm and viewer creating departments', async () => {
    for (const role of ['pm', 'viewer'] as const) {
      await assertFails(
        setDoc(
          doc(dbAs(role), `workspaces/${WKS_A}/departments/dep-${role}`),
          validDepartment(`dep-${role}`, { createdBy: `user-${role}` }),
        ),
      );
    }
  });

  it('denies create with a nonzero memberCount (server-maintained)', async () => {
    await assertFails(
      setDoc(
        doc(dbAs('owner'), `workspaces/${WKS_A}/departments/dep-x`),
        validDepartment('dep-x', { memberCount: 5 }),
      ),
    );
  });

  it('denies create where createdBy is not the caller', async () => {
    await assertFails(
      setDoc(
        doc(dbAs('admin'), `workspaces/${WKS_A}/departments/dep-x`),
        validDepartment('dep-x', { createdBy: 'someone-else' }),
      ),
    );
  });

  it('denies create with an id mismatching the doc id', async () => {
    await assertFails(
      setDoc(
        doc(dbAs('owner'), `workspaces/${WKS_A}/departments/dep-x`),
        validDepartment('other-id'),
      ),
    );
  });

  it('denies create with an empty name or extra keys', async () => {
    await assertFails(
      setDoc(
        doc(dbAs('owner'), `workspaces/${WKS_A}/departments/dep-x`),
        validDepartment('dep-x', { name: '' }),
      ),
    );
    await assertFails(
      setDoc(
        doc(dbAs('owner'), `workspaces/${WKS_A}/departments/dep-x`),
        validDepartment('dep-x', { hijacked: true }),
      ),
    );
  });

  it('denies cross-workspace create even for an owner', async () => {
    await assertFails(
      setDoc(
        doc(dbAs('owner', WKS_B), `workspaces/${WKS_A}/departments/dep-x`),
        validDepartment('dep-x'),
      ),
    );
  });
});

describe('department update', () => {
  it('allows owner and admin to rename', async () => {
    await assertSucceeds(updateDoc(doc(dbAs('owner'), DEP_PATH), { name: 'Litigation' }));
    await assertSucceeds(updateDoc(doc(dbAs('admin'), DEP_PATH), { name: 'Disputes' }));
  });

  it('denies pm and viewer updates', async () => {
    await assertFails(updateDoc(doc(dbAs('pm'), DEP_PATH), { name: 'Hacked' }));
    await assertFails(updateDoc(doc(dbAs('viewer'), DEP_PATH), { name: 'Hacked' }));
  });

  it('denies touching memberCount, createdAt, createdBy or id', async () => {
    await assertFails(updateDoc(doc(dbAs('owner'), DEP_PATH), { memberCount: 3 }));
    await assertFails(updateDoc(doc(dbAs('owner'), DEP_PATH), { createdAt: Timestamp.now() }));
    await assertFails(updateDoc(doc(dbAs('owner'), DEP_PATH), { createdBy: 'user-admin' }));
    await assertFails(updateDoc(doc(dbAs('owner'), DEP_PATH), { id: 'renamed' }));
  });
});

describe('department delete', () => {
  it('allows owner/admin to delete an empty department', async () => {
    await assertSucceeds(deleteDoc(doc(dbAs('owner'), DEP_PATH)));
  });

  it('denies deleting a department that still has members', async () => {
    await seedDoc(testEnv, DEP_PATH, validDepartment('dep-legal', { memberCount: 2 }));
    await assertFails(deleteDoc(doc(dbAs('owner'), DEP_PATH)));
  });

  it('denies pm and viewer deletes', async () => {
    await assertFails(deleteDoc(doc(dbAs('pm'), DEP_PATH)));
    await assertFails(deleteDoc(doc(dbAs('viewer'), DEP_PATH)));
  });
});
