/**
 * #104 member-doc profile denorm rules. A member doc now carries a server-written
 * `photoUrl` (the only member-readable source of a teammate's avatar, since
 * `users/{uid}` is owner-only readable). This confirms the read/isolation and
 * write model is unchanged by the new field:
 *   - a firm member CAN read another member's doc (incl. photoUrl) in the same workspace;
 *   - a non-member / other-workspace principal CANNOT (isolation guard);
 *   - clients still cannot write member docs (server-authored only).
 */

import { assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import type { RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';
import { afterAll, beforeAll, describe, it } from 'vitest';
import { createTestEnv, memberClaims, seedDoc } from './helpers.ts';

const WKS_A = 'wksA';
const WKS_B = 'wksB';
const ALICE = 'alice';
const BOB = 'bob';

const ALICE_MEMBER = `workspaces/${WKS_A}/members/${ALICE}`;
const BOB_MEMBER = `workspaces/${WKS_A}/members/${BOB}`;

let testEnv: RulesTestEnvironment;

beforeAll(async () => {
  testEnv = await createTestEnv('siapp-rules-members-profile');
  await seedDoc(testEnv, ALICE_MEMBER, {
    uid: ALICE,
    email: 'alice@firm.test',
    displayName: 'Alice Tan',
    photoUrl: 'https://cdn.example.test/alice.png',
    role: 'owner',
    departments: [],
    seatActive: true,
  });
  await seedDoc(testEnv, BOB_MEMBER, {
    uid: BOB,
    email: 'bob@firm.test',
    displayName: 'Bob Lee',
    role: 'pm',
    departments: [],
    seatActive: true,
  });
});

afterAll(async () => {
  await testEnv.cleanup();
});

function memberDb(uid: string, wid: string) {
  return testEnv.authenticatedContext(uid, { ...memberClaims(wid) }).firestore();
}

describe('members/{memberUid} read (with denormalised photoUrl)', () => {
  it("lets a workspace member read another member's doc, including photoUrl", async () => {
    await assertSucceeds(getDoc(doc(memberDb(BOB, WKS_A), ALICE_MEMBER)));
  });

  it('lets a member read their own doc', async () => {
    await assertSucceeds(getDoc(doc(memberDb(ALICE, WKS_A), ALICE_MEMBER)));
  });

  it("denies a principal from another workspace reading a member doc (isolation)", async () => {
    await assertFails(getDoc(doc(memberDb(BOB, WKS_B), ALICE_MEMBER)));
  });

  it('denies an unauthenticated read of a member doc', async () => {
    await assertFails(
      getDoc(doc(testEnv.unauthenticatedContext().firestore(), ALICE_MEMBER)),
    );
  });
});

describe('members/{memberUid} write is server-only', () => {
  it('denies a member updating photoUrl on their own member doc (server-authored)', async () => {
    await assertFails(
      updateDoc(doc(memberDb(ALICE, WKS_A), ALICE_MEMBER), {
        photoUrl: 'https://cdn.example.test/spoof.png',
      }),
    );
  });

  it("denies a member updating another member's photoUrl", async () => {
    await assertFails(
      updateDoc(doc(memberDb(BOB, WKS_A), ALICE_MEMBER), {
        photoUrl: 'https://cdn.example.test/spoof.png',
      }),
    );
  });

  it('denies creating a new member doc from the client', async () => {
    await assertFails(
      setDoc(doc(memberDb(ALICE, WKS_A), `workspaces/${WKS_A}/members/mallory`), {
        uid: 'mallory',
        email: 'mallory@firm.test',
        displayName: 'Mallory',
        role: 'owner',
        departments: [],
        seatActive: true,
      }),
    );
  });
});
