/**
 * Fans a user's `displayName` + `photoUrl` out to every
 * `workspaces/{wid}/members/{uid}` doc they belong to (#104). Member docs are
 * the only member-readable source of a teammate's avatar because `users/{uid}`
 * is owner-only readable, so the dashboard/team UI joins task-assignee uid →
 * member `photoUrl`. Mirrors the trust model of `syncMemberClaims`: member
 * docs are server-written only, and this Admin-SDK fan-out bypasses the
 * members `write: if false` rule.
 */

import { FieldValue, getFirestore, type DocumentSnapshot } from 'firebase-admin/firestore';
import type { Change, FirestoreEvent } from 'firebase-functions/v2/firestore';

type TUserWriteEvent = FirestoreEvent<
  Change<DocumentSnapshot> | undefined,
  { uid: string }
>;

/** The two user fields mirrored onto member docs. */
interface IMirroredProfile {
  displayName: string | undefined;
  photoUrl: string | undefined;
}

function readProfile(data: Record<string, unknown> | undefined): IMirroredProfile {
  const displayName = typeof data?.['displayName'] === 'string' ? data['displayName'] : undefined;
  const rawPhoto = data?.['photoUrl'];
  // Treat '' as "no photo" so removal and never-set collapse to the same state.
  const photoUrl = typeof rawPhoto === 'string' && rawPhoto !== '' ? rawPhoto : undefined;
  return { displayName, photoUrl };
}

/** True when neither mirrored field changed between before/after. */
export function isProfileSyncNoOp(
  before: Record<string, unknown> | undefined,
  after: Record<string, unknown> | undefined,
): boolean {
  const b = readProfile(before);
  const a = readProfile(after);
  return b.displayName === a.displayName && b.photoUrl === a.photoUrl;
}

/**
 * Build the merge payload for a member doc from the user's current profile.
 * A removed photo writes `FieldValue.delete()` so the stale copy disappears;
 * an absent displayName is simply not written (never blanked).
 */
export function memberProfilePatch(after: Record<string, unknown> | undefined): Record<
  string,
  unknown
> {
  const { displayName, photoUrl } = readProfile(after);
  const patch: Record<string, unknown> = {};
  if (displayName !== undefined) {
    patch['displayName'] = displayName;
  }
  patch['photoUrl'] = photoUrl === undefined ? FieldValue.delete() : photoUrl;
  return patch;
}

/**
 * On any `users/{uid}` write: if the mirrored profile changed, fan the new
 * `displayName`/`photoUrl` out to every member doc for that uid. The fan-out
 * writes member docs (not the user doc), so it never re-triggers itself.
 */
export async function syncMemberProfile(event: TUserWriteEvent): Promise<void> {
  const { uid } = event.params;
  const before = event.data?.before.data();
  const after = event.data?.after.data();

  // User doc deleted, or no meaningful change — nothing to propagate.
  if (after === undefined || isProfileSyncNoOp(before, after)) {
    return;
  }

  const db = getFirestore();
  // Member doc ids are the member's uid; the `uid` field mirrors it, backed by
  // the COLLECTION_GROUP index already used by syncMemberClaims.
  const memberDocs = await db.collectionGroup('members').where('uid', '==', uid).get();
  if (memberDocs.empty) {
    return;
  }

  const patch = memberProfilePatch(after);
  const batch = db.batch();
  for (const snapshot of memberDocs.docs) {
    batch.set(snapshot.ref, patch, { merge: true });
  }
  await batch.commit();
}
