/**
 * #23 activity rules: server-written project timeline. Reads follow the same
 * department need-to-know as tasks (owner/admin see all; pm/viewer must
 * constrain list queries and can only get entries whose restrictions match
 * their claims). ALL client writes are denied — entries are trigger/callable
 * written via the Admin SDK.
 */

import { assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import type { RulesTestEnvironment } from '@firebase/rules-unit-testing';
import type { TMemberRole } from '@siapp/shared';
import {
  Timestamp,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';
import { afterAll, beforeAll, describe, it } from 'vitest';
import { createTestEnv, memberClaims, seedDoc, seedWorkspace } from './helpers.ts';

const WKS_A = 'wksA';
const WKS_B = 'wksB';
const ACTIVITY_PATH = `workspaces/${WKS_A}/projects/proj1/activity`;
const OPEN_ENTRY_PATH = `${ACTIVITY_PATH}/act-open`;
const RESTRICTED_ENTRY_PATH = `${ACTIVITY_PATH}/act-fin`;

const DEP_FINANCE = 'dep-finance';
const DEP_SITE = 'dep-site';

let testEnv: RulesTestEnvironment;

beforeAll(async () => {
  testEnv = await createTestEnv('siapp-rules-activity');
  await seedWorkspace(testEnv, WKS_A);
  await seedWorkspace(testEnv, WKS_B);
  await seedDoc(testEnv, OPEN_ENTRY_PATH, validEntry('act-open'));
  await seedDoc(
    testEnv,
    RESTRICTED_ENTRY_PATH,
    validEntry('act-fin', { restrictedToDepartments: [DEP_FINANCE] }),
  );
});

afterAll(async () => {
  await testEnv.cleanup();
});

function dbAs(role: TMemberRole, wid: string = WKS_A, departments: string[] = []) {
  return testEnv
    .authenticatedContext(`user-${role}`, { ...memberClaims(wid, role, departments) })
    .firestore();
}

/** A server-shaped activity entry (seeded rules-off — clients can never write). */
function validEntry(id: string, extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id,
    action: 'task_status_changed',
    actorType: 'user',
    actorId: 'user-owner',
    actorNameDenorm: 'Olivia Owner',
    taskId: 'task1',
    taskTitleDenorm: 'Pour foundation',
    restrictedToDepartments: [],
    payload: { from: 'todo', to: 'in_progress' },
    at: Timestamp.now(),
    ...extra,
  };
}

describe('activity reads', () => {
  it('allows owner and admin to get any entry and list unconstrained', async () => {
    for (const role of ['owner', 'admin'] as const) {
      await assertSucceeds(getDoc(doc(dbAs(role), OPEN_ENTRY_PATH)));
      await assertSucceeds(getDoc(doc(dbAs(role), RESTRICTED_ENTRY_PATH)));
      await assertSucceeds(getDocs(collection(dbAs(role), ACTIVITY_PATH)));
    }
  });

  it('allows pm and viewer to get unrestricted entries', async () => {
    for (const role of ['pm', 'viewer'] as const) {
      await assertSucceeds(getDoc(doc(dbAs(role), OPEN_ENTRY_PATH)));
    }
  });

  it('denies a pm outside the department getting a restricted entry', async () => {
    await assertFails(getDoc(doc(dbAs('pm', WKS_A, [DEP_SITE]), RESTRICTED_ENTRY_PATH)));
  });

  it('allows a pm in the department to get a restricted entry', async () => {
    await assertSucceeds(getDoc(doc(dbAs('pm', WKS_A, [DEP_FINANCE]), RESTRICTED_ENTRY_PATH)));
  });

  it('denies pm/viewer unconstrained list queries', async () => {
    for (const role of ['pm', 'viewer'] as const) {
      await assertFails(getDocs(collection(dbAs(role, WKS_A, [DEP_FINANCE]), ACTIVITY_PATH)));
    }
  });

  it('allows pm/viewer the unrestricted-equality and own-department queries', async () => {
    const db = dbAs('pm', WKS_A, [DEP_FINANCE]);
    await assertSucceeds(
      getDocs(query(collection(db, ACTIVITY_PATH), where('restrictedToDepartments', '==', []))),
    );
    await assertSucceeds(
      getDocs(
        query(
          collection(db, ACTIVITY_PATH),
          where('restrictedToDepartments', 'array-contains', DEP_FINANCE),
        ),
      ),
    );
  });

  it('denies a department query for a department outside the claims', async () => {
    await assertFails(
      getDocs(
        query(
          collection(dbAs('pm', WKS_A, [DEP_SITE]), ACTIVITY_PATH),
          where('restrictedToDepartments', 'array-contains', DEP_FINANCE),
        ),
      ),
    );
  });

  it('denies cross-workspace activity reads', async () => {
    await assertFails(getDoc(doc(dbAs('owner', WKS_B), OPEN_ENTRY_PATH)));
  });
});

describe('activity writes are server-only', () => {
  it('denies create even for the workspace owner', async () => {
    await assertFails(
      setDoc(doc(dbAs('owner'), `${ACTIVITY_PATH}/act-new`), validEntry('act-new')),
    );
  });

  it('denies update even for the workspace owner', async () => {
    await assertFails(
      updateDoc(doc(dbAs('owner'), OPEN_ENTRY_PATH), { actorNameDenorm: 'Spoofed' }),
    );
  });

  it('denies delete even for the workspace owner', async () => {
    await assertFails(deleteDoc(doc(dbAs('owner'), OPEN_ENTRY_PATH)));
  });
});
