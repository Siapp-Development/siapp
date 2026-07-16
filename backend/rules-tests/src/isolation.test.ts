/**
 * Test groups 2–6 (plan §4):
 *   2. Cross-workspace deny — wksA member can't touch wksB (workspace isolation)
 *   3. Same-workspace member read allow (happy path — proves rules aren't deny-all)
 *   4. magicLinks are server-only, even for a workspace owner
 *   5. users/{uid} readable only by the user themselves
 *   6. ALL client writes denied, even for same-workspace members
 */

import { assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import type { RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { deleteDoc, doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';
import { afterAll, beforeAll, describe, it } from 'vitest';
import { createTestEnv, memberClaims, seedUser, seedWorkspace, workspacePaths } from './helpers.ts';

const WKS_A = 'wksA';
const WKS_B = 'wksB';
const MEMBER_A_UID = 'alice';
const OWNER_A_UID = 'olivia';

let testEnv: RulesTestEnvironment;

beforeAll(async () => {
  testEnv = await createTestEnv('siapp-rules-isolation');
  await seedWorkspace(testEnv, WKS_A);
  await seedWorkspace(testEnv, WKS_B);
  await seedUser(testEnv, MEMBER_A_UID);
  await seedUser(testEnv, 'someone-else');
});

afterAll(async () => {
  await testEnv.cleanup();
});

function memberADb() {
  return testEnv.authenticatedContext(MEMBER_A_UID, { ...memberClaims(WKS_A) }).firestore();
}

describe('workspace isolation (cross-workspace deny)', () => {
  it.each(Object.entries(workspacePaths(WKS_B)))(
    'wksA member cannot read %s in wksB',
    async (_label, path) => {
      await assertFails(getDoc(doc(memberADb(), path)));
    },
  );

  it.each(Object.entries(workspacePaths(WKS_B)))(
    'wksA member cannot write %s in wksB',
    async (_label, path) => {
      await assertFails(setDoc(doc(memberADb(), path), { hijacked: true }));
    },
  );
});

describe('same-workspace member reads (happy path)', () => {
  const paths = workspacePaths(WKS_A);

  it('allows reading the workspace doc', async () => {
    await assertSucceeds(getDoc(doc(memberADb(), paths.workspace)));
  });

  it('allows reading a member doc', async () => {
    await assertSucceeds(getDoc(doc(memberADb(), paths.member)));
  });

  it('allows reading a project doc', async () => {
    await assertSucceeds(getDoc(doc(memberADb(), paths.project)));
  });

  it('allows reading a task doc', async () => {
    await assertSucceeds(getDoc(doc(memberADb(), paths.task)));
  });
});

describe('magicLinks are server-only', () => {
  it('denies read even for the workspace owner', async () => {
    const ownerDb = testEnv
      .authenticatedContext(OWNER_A_UID, { ...memberClaims(WKS_A, 'owner') })
      .firestore();
    await assertFails(getDoc(doc(ownerDb, workspacePaths(WKS_A).magicLink)));
  });
});

describe('users/{uid} own-profile reads', () => {
  it('allows a user to read their own profile', async () => {
    await assertSucceeds(getDoc(doc(memberADb(), `users/${MEMBER_A_UID}`)));
  });

  it("denies reading another user's profile", async () => {
    await assertFails(getDoc(doc(memberADb(), 'users/someone-else')));
  });
});

describe('all client writes denied (no write features yet)', () => {
  const paths = workspacePaths(WKS_A);

  it('denies task create by a same-workspace member', async () => {
    await assertFails(
      setDoc(doc(memberADb(), `workspaces/${WKS_A}/projects/proj1/tasks/task-new`), {
        title: 'nope',
      }),
    );
  });

  it('denies task update by a same-workspace member', async () => {
    await assertFails(updateDoc(doc(memberADb(), paths.task), { title: 'renamed' }));
  });

  it('denies client create by a same-workspace member', async () => {
    await assertFails(
      setDoc(doc(memberADb(), `workspaces/${WKS_A}/clients/client-new`), { name: 'nope' }),
    );
  });

  it('denies client delete by a same-workspace member', async () => {
    await assertFails(deleteDoc(doc(memberADb(), paths.client)));
  });

  it('denies own-profile write (profile writes land with #9)', async () => {
    await assertFails(
      updateDoc(doc(memberADb(), `users/${MEMBER_A_UID}`), { displayName: 'Alice 2' }),
    );
  });
});
