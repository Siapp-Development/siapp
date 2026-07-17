/**
 * Mirrors `workspaces/{wid}/members/{uid}` role/departments into Firebase
 * Auth custom claims (#9). Member docs are written server-side only (#10
 * provisioning, #11 invites), which is what makes this trigger trustworthy.
 */

import { getAuth } from 'firebase-admin/auth';
import { FieldValue, getFirestore, type DocumentSnapshot } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions';
import type { Change, FirestoreEvent } from 'firebase-functions/v2/firestore';

import {
  CLAIMS_WARN_BYTES,
  buildClaimsPayload,
  claimsPayloadSizeBytes,
  isClaimsNoOp,
  isMemberRole,
  toStringArray,
  type IMembershipRecord,
} from '../lib/claims.js';

type TMemberWriteEvent = FirestoreEvent<
  Change<DocumentSnapshot> | undefined,
  { workspaceId: string; memberId: string }
>;

function isUserNotFound(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code: unknown }).code === 'auth/user-not-found'
  );
}

/**
 * On any member-doc write: rebuild the user's FULL claims payload from every
 * membership (collection-group query on `uid`), set it on the auth user, and
 * stamp `users/{uid}.claimsUpdatedAt` so a signed-in client refreshes its ID
 * token immediately instead of waiting for the <=1h SDK refresh.
 */
export async function syncMemberClaims(event: TMemberWriteEvent): Promise<void> {
  const { memberId } = event.params;
  const before = event.data?.before.data();
  const after = event.data?.after.data();

  if (isClaimsNoOp(before, after)) {
    return;
  }

  const db = getFirestore();
  // Member doc ids are the member's uid (firestore-data-model.md); the `uid`
  // field mirrors it, backed by the COLLECTION_GROUP index in
  // firestore.indexes.json.
  const memberDocs = await db.collectionGroup('members').where('uid', '==', memberId).get();

  const memberships: IMembershipRecord[] = [];
  for (const snapshot of memberDocs.docs) {
    const workspaceId = snapshot.ref.parent.parent?.id;
    const data = snapshot.data();
    const role = data['role'];
    if (workspaceId !== undefined && isMemberRole(role)) {
      memberships.push({
        workspaceId,
        role,
        departments: toStringArray(data['departments']),
      });
    }
  }

  const payload = buildClaimsPayload(memberships);
  const sizeBytes = claimsPayloadSizeBytes(payload);
  if (sizeBytes > CLAIMS_WARN_BYTES) {
    logger.warn(
      `syncMemberClaims: claims for ${memberId} are ${sizeBytes} bytes — ` +
        'approaching the 1000-byte custom-claims limit',
    );
  }

  try {
    await getAuth().setCustomUserClaims(memberId, payload);
  } catch (error) {
    if (isUserNotFound(error)) {
      // Member doc can precede the auth account (#10/#11 provisioning order);
      // the next member write after account creation will sync claims.
      logger.info(`syncMemberClaims: no auth user for ${memberId} yet — skipping claims set`);
      return;
    }
    throw error;
  }

  // Server-only stamp (enforced by firestore.rules) that tells the client's
  // AuthProvider to call getIdToken(true) now.
  await db
    .doc(`users/${memberId}`)
    .set({ claimsUpdatedAt: FieldValue.serverTimestamp() }, { merge: true });
}
