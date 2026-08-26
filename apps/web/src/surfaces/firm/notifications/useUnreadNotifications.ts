/**
 * Cheap red-dot existence subscription (#134). Subscribes to a single unread
 * notification (`where('read','==',false)`, `limit(1)`) and reports only a
 * boolean — the bell shows a dot, never a count. Errors resolve to `false`
 * (fail closed: no phantom dot on a broken subscription).
 */

import { collection, limit, onSnapshot, query, where } from 'firebase/firestore';
import { useEffect, useState } from 'react';

import { db } from '@/lib/firebase.ts';

export function useUnreadNotifications(workspaceId: string, uid: string): boolean {
  const path = `workspaces/${workspaceId}/members/${uid}/notifications`;
  const [hasUnread, setHasUnread] = useState(false);

  useEffect(() => {
    setHasUnread(false);
    const unsubscribe = onSnapshot(
      query(collection(db, path), where('read', '==', false), limit(1)),
      (snapshot) => setHasUnread(!snapshot.empty),
      () => setHasUnread(false),
    );
    return () => unsubscribe();
  }, [path]);

  return hasUnread;
}
