/**
 * Recounts seatActive members into `workspaces/{wid}.seatsUsed` (#11).
 * Runs after every member write; display/billing counter only, so a plain
 * aggregate recount (no transaction) is sufficient.
 */

import { getFirestore } from 'firebase-admin/firestore';

export async function recountSeats(workspaceId: string): Promise<void> {
  const db = getFirestore();
  const workspaceRef = db.doc(`workspaces/${workspaceId}`);
  const count = await workspaceRef
    .collection('members')
    .where('seatActive', '==', true)
    .count()
    .get();
  await workspaceRef.set({ seatsUsed: count.data().count }, { merge: true });
}
