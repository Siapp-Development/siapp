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
  deleteField,
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

  it('allows creating a profile whose email differs from the token only by case (#104 fix)', async () => {
    // Mirror of the update-path casing regression: create must also tolerate
    // casing so a freshly written profile does not re-introduce the drift bug.
    // Uses a fresh uid (no existing doc) so this is a clean create, and a
    // mixed-case TOKEN email against a lowercased payload email.
    const zoeDb = testEnv
      .authenticatedContext('zoe', { email: 'Zoe@Firm.Test' })
      .firestore();
    await assertSucceeds(
      setDoc(doc(zoeDb, 'users/zoe'), {
        ...validProfilePayload('zoe', 'zoe@firm.test'),
        createdAt: serverTimestamp(),
        lastSeenAt: serverTimestamp(),
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

  it('allows the owner to set displayName + photoUrl together (#104)', async () => {
    await seedUserProfile(testEnv, 'ivy', 'ivy@firm.test');
    const db = testEnv.authenticatedContext('ivy', { email: 'ivy@firm.test' }).firestore();
    await assertSucceeds(
      updateDoc(doc(db, 'users/ivy'), {
        displayName: 'Ivy Chen',
        photoUrl: 'https://cdn.example.test/ivy.png',
      }),
    );
  });

  it('allows the owner to remove their photoUrl via deleteField (#104)', async () => {
    await seedUserProfile(testEnv, 'jack', 'jack@firm.test', {
      photoUrl: 'https://cdn.example.test/jack.png',
    });
    const db = testEnv.authenticatedContext('jack', { email: 'jack@firm.test' }).firestore();
    await assertSucceeds(updateDoc(doc(db, 'users/jack'), { photoUrl: deleteField() }));
  });

  it('denies a non-string photoUrl (validUserProfile guard)', async () => {
    await seedUserProfile(testEnv, 'kara', 'kara@firm.test');
    const db = testEnv.authenticatedContext('kara', { email: 'kara@firm.test' }).firestore();
    await assertFails(updateDoc(doc(db, 'users/kara'), { photoUrl: 42 }));
  });

  it('allows a partial save when the stored email casing drifted from the token (#104 fix)', async () => {
    // Regression for the DD Development bug: a stored email that differs from the
    // token ONLY by case (e.g. `Lara@Firm.Test` vs `lara@firm.test`) used to fail
    // validUserProfile's exact `==` compare on every partial update, permanently
    // blocking profile saves. With the case-insensitive `.lower()` compare it now
    // succeeds. Before this fix this update would have been DENIED.
    await seedUserProfile(testEnv, 'lara', 'Lara@Firm.Test');
    const db = testEnv.authenticatedContext('lara', { email: 'lara@firm.test' }).firestore();
    await assertSucceeds(
      updateDoc(doc(db, 'users/lara'), {
        displayName: 'Lara Q',
        photoUrl: 'https://cdn.example.test/lara.png',
      }),
    );
  });

  it('still denies rewriting the email to a genuinely different address (casing tolerance is scoped)', async () => {
    // Confirms the `.lower()` loosening only tolerates casing, never a different
    // identity: the owner cannot repoint their profile email at another address.
    await seedUserProfile(testEnv, 'nora', 'nora@firm.test');
    const db = testEnv.authenticatedContext('nora', { email: 'nora@firm.test' }).firestore();
    await assertFails(updateDoc(doc(db, 'users/nora'), { email: 'attacker@firm.test' }));
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
