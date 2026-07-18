/**
 * Writes an entry to the top-level `/adminLog/{alid}` collection.
 * All writes use the Admin SDK — client writes are denied by Firestore rules.
 */

import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import type { IAdminLogDoc } from './adminTypes.js';

/** Writes a new admin audit-log entry. The `id` field is generated here. */
export async function writeAdminLog(
  entry: Omit<IAdminLogDoc, 'id' | 'ts'>,
): Promise<void> {
  const db = getFirestore();
  const ref = db.collection('adminLog').doc();
  await ref.set({
    ...entry,
    id: ref.id,
    ts: FieldValue.serverTimestamp(),
  });
}
