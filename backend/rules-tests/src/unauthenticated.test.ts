/**
 * Test group 1 (plan §4): unauthenticated requests are denied on every
 * top-level collection and workspace subcollection — read AND create.
 */

import { assertFails } from '@firebase/rules-unit-testing';
import type { RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { collection, doc, getDoc, getDocs, setDoc } from 'firebase/firestore';
import { afterAll, beforeAll, describe, it } from 'vitest';
import { createTestEnv, seedUser, seedWorkspace, workspacePaths } from './helpers.ts';

const WID = 'wksA';

let testEnv: RulesTestEnvironment;

beforeAll(async () => {
  testEnv = await createTestEnv('siapp-rules-unauthenticated');
  await seedWorkspace(testEnv, WID);
  await seedUser(testEnv, 'u1');
});

afterAll(async () => {
  await testEnv.cleanup();
});

describe('unauthenticated access', () => {
  const topLevelPaths = {
    user: 'users/u1',
    phoneIndex: 'phoneIndex/+60123456789',
  };

  const allPaths = () => ({ ...topLevelPaths, ...workspacePaths(WID) });

  it.each(Object.entries(allPaths()))('denies get on %s', async (_label, path) => {
    const db = testEnv.unauthenticatedContext().firestore();
    await assertFails(getDoc(doc(db, path)));
  });

  it.each(Object.entries(allPaths()))('denies create on %s', async (_label, path) => {
    const db = testEnv.unauthenticatedContext().firestore();
    await assertFails(setDoc(doc(db, `${path}-new`), { intruder: true }));
  });

  it('denies listing the workspaces collection', async () => {
    const db = testEnv.unauthenticatedContext().firestore();
    await assertFails(getDocs(collection(db, 'workspaces')));
  });
});
