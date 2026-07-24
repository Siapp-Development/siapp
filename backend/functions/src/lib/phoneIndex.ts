/**
 * Cross-workspace phone index maintenance (#16, D-035). `/phoneIndex/{phone}`
 * maps an E.164 number to every client/collaborator ref that uses it — the
 * inbound-webhook lookup for #19. Client writes are denied by rules; only
 * the onClientWrite / onCollaboratorWrite triggers touch it via this module.
 *
 * The ref-list transforms are pure (no Admin SDK) so they unit-test without
 * emulators — same convention as restrictedTasks.ts.
 */

import { FieldValue, Timestamp, getFirestore } from 'firebase-admin/firestore';

export type TPhoneRefType = 'client' | 'collaborator';

/** Identity of one entry inside `/phoneIndex/{phone}.refs[]`. */
export interface IPhoneRefKey {
  workspaceId: string;
  type: TPhoneRefType;
  refId: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function matchesKey(entry: Record<string, unknown>, key: IPhoneRefKey): boolean {
  return (
    entry['workspaceId'] === key.workspaceId &&
    entry['type'] === key.type &&
    entry['refId'] === key.refId
  );
}

/** Pure: `refs` without the entry for `key` (drops malformed entries too). */
export function refsWithout(refs: unknown, key: IPhoneRefKey): Array<Record<string, unknown>> {
  if (!Array.isArray(refs)) {
    return [];
  }
  return refs.filter((entry): entry is Record<string, unknown> => isRecord(entry)).filter(
    (entry) => !matchesKey(entry, key),
  );
}

/** Pure: `refs` with an entry for `key` present — appended when missing. */
export function refsWith(
  refs: unknown,
  key: IPhoneRefKey,
  addedAt: unknown,
): Array<Record<string, unknown>> {
  const list = Array.isArray(refs)
    ? refs.filter((entry): entry is Record<string, unknown> => isRecord(entry))
    : [];
  if (list.some((entry) => matchesKey(entry, key))) {
    return list;
  }
  return [...list, { workspaceId: key.workspaceId, type: key.type, refId: key.refId, addedAt }];
}

export interface ISyncPhoneIndexParams {
  workspaceId: string;
  type: TPhoneRefType;
  refId: string;
  /** E.164 phone before the write; null on create or when the doc had none. */
  beforePhone: string | null;
  /** E.164 phone after the write; null on delete or when the doc has none. */
  afterPhone: string | null;
}

/**
 * Transactionally moves the ref from `/phoneIndex/{beforePhone}` to
 * `/phoneIndex/{afterPhone}`: the old doc loses the ref (and is deleted when
 * its ref list empties); the new doc gains it. Idempotent — re-running on
 * the same state is a no-op.
 */
export async function syncPhoneIndex(params: ISyncPhoneIndexParams): Promise<void> {
  const { workspaceId, type, refId, beforePhone, afterPhone } = params;
  if (beforePhone === null && afterPhone === null) {
    return;
  }
  const db = getFirestore();
  const key: IPhoneRefKey = { workspaceId, type, refId };

  await db.runTransaction(async (txn) => {
    const beforeRef =
      beforePhone !== null && beforePhone !== afterPhone
        ? db.doc(`phoneIndex/${beforePhone}`)
        : null;
    const afterRef = afterPhone !== null ? db.doc(`phoneIndex/${afterPhone}`) : null;

    const beforeSnap = beforeRef !== null ? await txn.get(beforeRef) : null;
    const afterSnap = afterRef !== null ? await txn.get(afterRef) : null;

    if (beforeRef !== null && beforeSnap !== null && beforeSnap.exists) {
      const remaining = refsWithout(beforeSnap.get('refs'), key);
      if (remaining.length === 0) {
        txn.delete(beforeRef);
      } else {
        txn.update(beforeRef, { refs: remaining, updatedAt: FieldValue.serverTimestamp() });
      }
    }

    if (afterRef !== null && afterPhone !== null) {
      const current = afterSnap !== null && afterSnap.exists ? afterSnap.get('refs') : [];
      const next = refsWith(current, key, Timestamp.now());
      const currentSize = Array.isArray(current) ? current.length : 0;
      const alreadyPresent = afterSnap !== null && afterSnap.exists && next.length === currentSize;
      if (!alreadyPresent) {
        txn.set(
          afterRef,
          { phone: afterPhone, refs: next, updatedAt: FieldValue.serverTimestamp() },
          { merge: true },
        );
      }
    }
  });
}
