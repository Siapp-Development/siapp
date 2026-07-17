/**
 * #9 users/{uid} profile write rules: own create/update with a valid payload
 * succeeds; everything else — other uids, mismatched token email, extra
 * fields, claimsUpdatedAt tampering (server-only), createdAt rewrites,
 * deletes, lists, unauthenticated — is denied.
 */

import { assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import type { RulesTestEnvironment } from '@firebase/rules-unit-testing';
import {
  Timestamp,
  collection,
  deleteDoc,
  doc,
  getDocs,
  serverTimestamp,
  setDoc,
  updateDoc,
} from 'firebase/firestore';
import { afterAll, beforeAll, describe, it } from 'vitest';
import { createTestEnv, seedUserProfile, validProfilePayload } from './helpers.ts';

const ALICE = 'alice';
const ALICE_EMAIL = 'alice@firm.test';

let testEnv: RulesTestEnvironment;

beforeAll(async () => {
  testEnv = await createTestEnv('siapp-rules-users-profile');
});

afterAll(async () => {
  await testEnv.cleanup();
});

function aliceDb() {
  return testEnv.authenticatedContext(ALICE, { email: ALICE_EMAIL }).firestore();
}

describe('users/{uid} create', () => {
  it('allows creating your own profile with a valid payload', async () => {
    await assertSucceeds(
      setDoc(doc(aliceDb(), `users/${ALICE}`), {
        ...validProfilePayload(ALICE, ALICE_EMAIL),
        createdAt: serverTimestamp(),
        lastSeenAt: serverTimestamp(),
      }),
    );
  });

  it("denies creating another user's profile", async () => {
    await assertFails(
      setDoc(doc(aliceDb(), 'users/bob'), validProfilePayload('bob', 'bob@firm.test')),
    );
  });

  it('denies a uid field that does not match the token', async () => {
    await assertFails(
      setDoc(doc(aliceDb(), `users/${ALICE}`), {
        ...validProfilePayload(ALICE, ALICE_EMAIL),
        uid: 'bob',
      }),
    );
  });

  it('denies an email that does not match the token email', async () => {
    await assertFails(
      setDoc(doc(aliceDb(), `users/${ALICE}`), {
        ...validProfilePayload(ALICE, 'spoofed@firm.test'),
      }),
    );
  });

  it('denies extra fields outside the whitelist', async () => {
    await assertFails(
      setDoc(doc(aliceDb(), `users/${ALICE}`), {
        ...validProfilePayload(ALICE, ALICE_EMAIL),
        isAdmin: true,
      }),
    );
  });

  it('denies setting the server-only claimsUpdatedAt on create', async () => {
    await assertFails(
      setDoc(doc(aliceDb(), `users/${ALICE}`), {
        ...validProfilePayload(ALICE, ALICE_EMAIL),
        claimsUpdatedAt: Timestamp.now(),
      }),
    );
  });

  it('denies an empty displayName', async () => {
    await assertFails(
      setDoc(doc(aliceDb(), `users/${ALICE}`), {
        ...validProfilePayload(ALICE, ALICE_EMAIL),
        displayName: '',
      }),
    );
  });

  it('denies an unsupported locale (D-026: en only at MVP)', async () => {
    await assertFails(
      setDoc(doc(aliceDb(), `users/${ALICE}`), {
        ...validProfilePayload(ALICE, ALICE_EMAIL),
        locale: 'ms',
      }),
    );
  });

  it('denies unauthenticated profile creation', async () => {
    const db = testEnv.unauthenticatedContext().firestore();
    await assertFails(
      setDoc(doc(db, 'users/anon'), validProfilePayload('anon', 'anon@firm.test')),
    );
  });
});

describe('users/{uid} update', () => {
  it('allows the owner to bump lastSeenAt', async () => {
    await seedUserProfile(testEnv, 'carol', 'carol@firm.test');
    const db = testEnv.authenticatedContext('carol', { email: 'carol@firm.test' }).firestore();
    await assertSucceeds(updateDoc(doc(db, 'users/carol'), { lastSeenAt: serverTimestamp() }));
  });

  it('allows an update that leaves a server-stamped claimsUpdatedAt untouched', async () => {
    await seedUserProfile(testEnv, 'dave', 'dave@firm.test', {
      claimsUpdatedAt: Timestamp.now(),
    });
    const db = testEnv.authenticatedContext('dave', { email: 'dave@firm.test' }).firestore();
    await assertSucceeds(updateDoc(doc(db, 'users/dave'), { lastSeenAt: serverTimestamp() }));
  });

  it('denies changing the server-only claimsUpdatedAt', async () => {
    await seedUserProfile(testEnv, 'erin', 'erin@firm.test', {
      claimsUpdatedAt: Timestamp.fromMillis(1000),
    });
    const db = testEnv.authenticatedContext('erin', { email: 'erin@firm.test' }).firestore();
    await assertFails(
      updateDoc(doc(db, 'users/erin'), { claimsUpdatedAt: serverTimestamp() }),
    );
  });

  it('denies rewriting createdAt', async () => {
    await seedUserProfile(testEnv, 'frank', 'frank@firm.test');
    const db = testEnv.authenticatedContext('frank', { email: 'frank@firm.test' }).firestore();
    await assertFails(updateDoc(doc(db, 'users/frank'), { createdAt: serverTimestamp() }));
  });

  it("denies updating another user's profile", async () => {
    await seedUserProfile(testEnv, 'grace', 'grace@firm.test');
    await assertFails(
      updateDoc(doc(aliceDb(), 'users/grace'), { lastSeenAt: serverTimestamp() }),
    );
  });
});

describe('users/{uid} delete & list', () => {
  it('denies deleting your own profile', async () => {
    await seedUserProfile(testEnv, 'henry', 'henry@firm.test');
    const db = testEnv.authenticatedContext('henry', { email: 'henry@firm.test' }).firestore();
    await assertFails(deleteDoc(doc(db, 'users/henry')));
  });

  it('denies listing the users collection', async () => {
    await assertFails(getDocs(collection(aliceDb(), 'users')));
  });
});
