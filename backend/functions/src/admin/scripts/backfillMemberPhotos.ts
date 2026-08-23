/**
 * One-off backfill (#104): copies each user's current `displayName`/`photoUrl`
 * onto every `workspaces/{wid}/members/{uid}` doc so existing teammates'
 * avatars appear immediately, instead of only after their next profile edit
 * (which is when the `syncMemberProfile` trigger would otherwise fire).
 *
 * Usage:
 *   GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json \
 *   node --loader ts-node/esm backfillMemberPhotos.ts
 *
 * Idempotent: re-running writes the same denormalised values. Users without a
 * photo get `photoUrl` cleared on their member docs (via FieldValue.delete),
 * matching the trigger's behaviour, so the backfill is also a repair pass.
 *
 * Prerequisites:
 *   - A service account with Cloud Datastore/Firestore access.
 *   - GOOGLE_APPLICATION_CREDENTIALS pointing to the service-account JSON.
 */

import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

import { memberProfilePatch } from '../../triggers/syncMemberProfile.js';

initializeApp();
const db = getFirestore();

const usersSnap = await db.collection('users').get();
let scannedUsers = 0;
let patchedMembers = 0;

for (const userDoc of usersSnap.docs) {
  scannedUsers += 1;
  const uid = userDoc.id;
  const memberDocs = await db.collectionGroup('members').where('uid', '==', uid).get();
  if (memberDocs.empty) {
    continue;
  }

  const patch = memberProfilePatch(userDoc.data());
  const batch = db.batch();
  for (const memberSnap of memberDocs.docs) {
    batch.set(memberSnap.ref, patch, { merge: true });
    patchedMembers += 1;
  }
  await batch.commit();
}

process.stdout.write(
  `✓ backfill complete — scanned ${scannedUsers} users, patched ${patchedMembers} member docs\n`,
);
