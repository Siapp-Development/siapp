/**
 * #11 department need-to-know matrix (20-access-control-departments.md):
 * restricted tasks / task updates / documents are readable only by
 * owner/admin or members whose claims list a matching department.
 * Unrestricted content (empty or missing restrictedToDepartments) stays
 * readable by every active member.
 */

import { assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import type { RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { collection, doc, getDoc, getDocs, query, where } from 'firebase/firestore';
import { afterAll, beforeAll, describe, it } from 'vitest';
import { createTestEnv, memberClaims, seedDoc, seedWorkspace } from './helpers.ts';

const WKS_A = 'wksA';
const WKS_B = 'wksB';
const DEP = 'dep-legal';
const OTHER_DEP = 'dep-site';

const BASE = `workspaces/${WKS_A}/projects/proj1`;
const RESTRICTED_TASK = `${BASE}/tasks/task-restricted`;
const OPEN_TASK = `${BASE}/tasks/task-open`;
const LEGACY_TASK = `${BASE}/tasks/task-legacy`;
const RESTRICTED_UPDATE = `${RESTRICTED_TASK}/updates/upd1`;
const OPEN_UPDATE = `${OPEN_TASK}/updates/upd1`;
const RESTRICTED_DOC = `${BASE}/documents/doc-restricted`;
const OPEN_DOC = `${BASE}/documents/doc-open`;

let testEnv: RulesTestEnvironment;

beforeAll(async () => {
  testEnv = await createTestEnv('siapp-rules-restricted-content');
  await seedWorkspace(testEnv, WKS_A);
  await seedWorkspace(testEnv, WKS_B);
  await seedDoc(testEnv, RESTRICTED_TASK, {
    title: 'Sensitive filing',
    restrictedToDepartments: [DEP],
  });
  await seedDoc(testEnv, OPEN_TASK, { title: 'Open task', restrictedToDepartments: [] });
  // Pre-#11 doc without the field at all — must stay readable.
  await seedDoc(testEnv, LEGACY_TASK, { title: 'Legacy task' });
  await seedDoc(testEnv, RESTRICTED_UPDATE, { action: 'comment' });
  await seedDoc(testEnv, OPEN_UPDATE, { action: 'comment' });
  await seedDoc(testEnv, RESTRICTED_DOC, {
    name: 'nda.pdf',
    restrictedToDepartments: [DEP],
  });
  await seedDoc(testEnv, OPEN_DOC, { name: 'site-plan.pdf', restrictedToDepartments: [] });
});

afterAll(async () => {
  await testEnv.cleanup();
});

function db(uid: string, claims: Record<string, unknown>) {
  return testEnv.authenticatedContext(uid, claims).firestore();
}

const inDept = () => db('pm-in-dept', { ...memberClaims(WKS_A, 'pm', [DEP]) });
const notInDept = () => db('pm-no-dept', { ...memberClaims(WKS_A, 'pm', []) });
const otherDept = () => db('pm-other-dept', { ...memberClaims(WKS_A, 'pm', [OTHER_DEP]) });
const viewerNoDept = () => db('viewer-no-dept', { ...memberClaims(WKS_A, 'viewer', []) });
const admin = () => db('user-admin', { ...memberClaims(WKS_A, 'admin', []) });
const owner = () => db('user-owner', { ...memberClaims(WKS_A, 'owner', []) });
const intruder = () => db('intruder', { ...memberClaims(WKS_B, 'owner', [DEP]) });

describe('restricted task reads', () => {
  it('allows a pm in the department', async () => {
    await assertSucceeds(getDoc(doc(inDept(), RESTRICTED_TASK)));
  });

  it('denies a pm with no departments', async () => {
    await assertFails(getDoc(doc(notInDept(), RESTRICTED_TASK)));
  });

  it('denies a pm in a different department', async () => {
    await assertFails(getDoc(doc(otherDept(), RESTRICTED_TASK)));
  });

  it('denies a viewer with no departments', async () => {
    await assertFails(getDoc(doc(viewerNoDept(), RESTRICTED_TASK)));
  });

  it('allows admin and owner regardless of department membership', async () => {
    await assertSucceeds(getDoc(doc(admin(), RESTRICTED_TASK)));
    await assertSucceeds(getDoc(doc(owner(), RESTRICTED_TASK)));
  });

  it('denies another workspace even with a matching department claim', async () => {
    await assertFails(getDoc(doc(intruder(), RESTRICTED_TASK)));
  });
});

describe('unrestricted task reads', () => {
  it('allows every member when restrictedToDepartments is empty', async () => {
    await assertSucceeds(getDoc(doc(notInDept(), OPEN_TASK)));
    await assertSucceeds(getDoc(doc(viewerNoDept(), OPEN_TASK)));
  });

  it('allows every member when the field is missing (legacy docs)', async () => {
    await assertSucceeds(getDoc(doc(notInDept(), LEGACY_TASK)));
  });
});

describe('task update reads inherit the parent task restriction', () => {
  it('allows a pm in the department', async () => {
    await assertSucceeds(getDoc(doc(inDept(), RESTRICTED_UPDATE)));
  });

  it('denies a pm outside the department', async () => {
    await assertFails(getDoc(doc(notInDept(), RESTRICTED_UPDATE)));
  });

  it('allows admin regardless of departments', async () => {
    await assertSucceeds(getDoc(doc(admin(), RESTRICTED_UPDATE)));
  });

  it('allows anyone on updates under an unrestricted task', async () => {
    await assertSucceeds(getDoc(doc(notInDept(), OPEN_UPDATE)));
  });
});

describe('restricted document reads', () => {
  it('allows a pm in the department', async () => {
    await assertSucceeds(getDoc(doc(inDept(), RESTRICTED_DOC)));
  });

  it('denies a pm outside the department', async () => {
    await assertFails(getDoc(doc(notInDept(), RESTRICTED_DOC)));
    await assertFails(getDoc(doc(otherDept(), RESTRICTED_DOC)));
  });

  it('allows owner regardless of departments', async () => {
    await assertSucceeds(getDoc(doc(owner(), RESTRICTED_DOC)));
  });

  it('allows every member on unrestricted documents', async () => {
    await assertSucceeds(getDoc(doc(viewerNoDept(), OPEN_DOC)));
  });
});

describe('document list queries (#13 canSeeRestrictedList)', () => {
  const DOCS_PATH = `${BASE}/documents`;

  it('denies pm unconstrained document lists (would leak restricted docs)', async () => {
    await assertFails(getDocs(collection(notInDept(), DOCS_PATH)));
  });

  it('allows owner unconstrained; pm only with a restriction constraint', async () => {
    await assertSucceeds(getDocs(collection(owner(), DOCS_PATH)));
    await assertSucceeds(
      getDocs(query(collection(notInDept(), DOCS_PATH), where('restrictedToDepartments', '==', []))),
    );
    await assertSucceeds(
      getDocs(
        query(
          collection(inDept(), DOCS_PATH),
          where('restrictedToDepartments', 'array-contains', DEP),
        ),
      ),
    );
  });
});
