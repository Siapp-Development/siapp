/**
 * #134 in-app notification inbox rules. Notifications live under each member's
 * `workspaces/{wid}/members/{uid}/notifications/{nid}` subcollection and are
 * server-written only. A member may READ only their OWN inbox (not another
 * member's, despite the parent members doc granting workspace-wide read), and
 * may UPDATE only the `read`/`readAt` fields on their own docs. `create` and
 * `delete` are denied for every client.
 */

import { assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import type { RulesTestEnvironment } from '@firebase/rules-unit-testing';
import type { TMemberRole } from '@siapp/shared';
import { Timestamp, deleteDoc, doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';

import { createTestEnv, memberClaims, seedDoc, seedWorkspace } from './helpers.ts';

const WKS_A = 'wksA';
const WKS_B = 'wksB';

const ALICE = 'alice';
const BOB = 'bob';

const ALICE_NOTIF = `workspaces/${WKS_A}/members/${ALICE}/notifications/n1`;
const BOB_NOTIF = `workspaces/${WKS_A}/members/${BOB}/notifications/n1`;

let testEnv: RulesTestEnvironment;

/** A server-shaped notification doc (seeded rules-off — clients never create). */
function validNotification(id: string, extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id,
    kind: 'task_assigned',
    at: Timestamp.now(),
    read: false,
    readAt: null,
    actorType: 'user',
    actorId: 'someone',
    actorNameDenorm: 'Someone',
    projectId: 'proj1',
    projectNameDenorm: 'Project One',
    taskId: 'task1',
    taskTitleDenorm: 'Pour foundation',
    excerpt: null,
    sourceActivityId: 'act1',
    ...extra,
  };
}

beforeAll(async () => {
  testEnv = await createTestEnv('siapp-rules-notifications-inbox');
  await seedWorkspace(testEnv, WKS_A);
  await seedWorkspace(testEnv, WKS_B);
});

beforeEach(async () => {
  await seedDoc(testEnv, ALICE_NOTIF, validNotification('n1'));
  await seedDoc(testEnv, BOB_NOTIF, validNotification('n1'));
});

afterAll(async () => {
  await testEnv.cleanup();
});

/** Auth context with a firm-member claim whose uid == the member subdoc key. */
function dbAs(uid: string, role: TMemberRole = 'pm', wid: string = WKS_A) {
  return testEnv.authenticatedContext(uid, { ...memberClaims(wid, role) }).firestore();
}

describe('notification inbox — reads', () => {
  it('lets a member read their own notification', async () => {
    await assertSucceeds(getDoc(doc(dbAs(ALICE), ALICE_NOTIF)));
  });

  it("denies reading another member's inbox in the same workspace", async () => {
    await assertFails(getDoc(doc(dbAs(BOB), ALICE_NOTIF)));
  });

  it('denies a cross-workspace read', async () => {
    // Alice authenticated for wksB only cannot read her wksA inbox.
    await assertFails(getDoc(doc(dbAs(ALICE, 'pm', WKS_B), ALICE_NOTIF)));
  });
});

describe('notification inbox — updates', () => {
  it('lets a member flip read/readAt on their own doc', async () => {
    await assertSucceeds(
      updateDoc(doc(dbAs(ALICE), ALICE_NOTIF), { read: true, readAt: Timestamp.now() }),
    );
  });

  it('denies changing any other field', async () => {
    await assertFails(updateDoc(doc(dbAs(ALICE), ALICE_NOTIF), { kind: 'mention' }));
    await assertFails(updateDoc(doc(dbAs(ALICE), ALICE_NOTIF), { taskId: 'other' }));
    await assertFails(
      updateDoc(doc(dbAs(ALICE), ALICE_NOTIF), { read: true, taskId: 'other' }),
    );
  });

  it('denies a non-bool read value', async () => {
    await assertFails(updateDoc(doc(dbAs(ALICE), ALICE_NOTIF), { read: 'yes' }));
  });

  it("denies updating another member's doc", async () => {
    await assertFails(updateDoc(doc(dbAs(BOB), ALICE_NOTIF), { read: true }));
  });
});

describe('notification inbox — create/delete are server-only', () => {
  it('denies create by the owning member', async () => {
    await assertFails(
      setDoc(doc(dbAs(ALICE), `workspaces/${WKS_A}/members/${ALICE}/notifications/new`), {
        ...validNotification('new'),
      }),
    );
  });

  it('denies delete by the owning member', async () => {
    await assertFails(deleteDoc(doc(dbAs(ALICE), ALICE_NOTIF)));
  });
});
