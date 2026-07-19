/**
 * Live Firestore subscriptions for the Team settings page (#11). Kept in one
 * module so component tests can mock the data layer wholesale.
 */

import type { TInviteRole, TMemberRole } from '@siapp/shared';
import {
  Timestamp,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  type DocumentData,
} from 'firebase/firestore';
import { useEffect, useState } from 'react';

import { db } from '@/lib/firebase.ts';

export interface IMemberRow {
  uid: string;
  email: string;
  displayName: string;
  role: TMemberRole;
  departments: string[];
  seatActive: boolean;
}

export interface IInviteRow {
  id: string;
  email: string;
  role: TInviteRole;
  expiresAt: Date | null;
}

export interface IDepartmentRow {
  id: string;
  name: string;
  memberCount: number;
}

export type TCollectionState<T> =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'ready'; rows: T[] };

function useCollection<T>(
  path: string | null,
  mapDoc: (id: string, data: DocumentData) => T,
  pendingOnly = false,
): TCollectionState<T> {
  const [state, setState] = useState<TCollectionState<T>>({ status: 'loading' });

  useEffect(() => {
    if (path === null) {
      return;
    }
    setState({ status: 'loading' });
    const ref = collection(db, path);
    const target = pendingOnly ? query(ref, where('status', '==', 'pending')) : ref;
    return onSnapshot(
      target,
      (snapshot) => {
        setState({
          status: 'ready',
          rows: snapshot.docs.map((docSnap) => mapDoc(docSnap.id, docSnap.data())),
        });
      },
      () => setState({ status: 'error' }),
    );
    // mapDoc is a module-level constant at every call site.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, pendingOnly]);

  return state;
}

const mapMember = (id: string, data: DocumentData): IMemberRow => ({
  uid: id,
  email: String(data['email'] ?? ''),
  displayName: String(data['displayName'] ?? ''),
  role: (data['role'] ?? 'viewer') as TMemberRole,
  departments: Array.isArray(data['departments'])
    ? data['departments'].filter((d): d is string => typeof d === 'string')
    : [],
  seatActive: data['seatActive'] === true,
});

const mapInvite = (id: string, data: DocumentData): IInviteRow => ({
  id,
  email: String(data['email'] ?? ''),
  role: (data['role'] ?? 'viewer') as TInviteRole,
  expiresAt: data['expiresAt'] instanceof Timestamp ? data['expiresAt'].toDate() : null,
});

const mapDepartment = (id: string, data: DocumentData): IDepartmentRow => ({
  id,
  name: String(data['name'] ?? ''),
  memberCount: typeof data['memberCount'] === 'number' ? data['memberCount'] : 0,
});

export function useMembers(workspaceId: string): TCollectionState<IMemberRow> {
  return useCollection(`workspaces/${workspaceId}/members`, mapMember);
}

/** Pass `enabled: false` for pm/viewer — rules deny them invite reads. */
export function usePendingInvites(
  workspaceId: string,
  enabled: boolean,
): TCollectionState<IInviteRow> {
  return useCollection(enabled ? `workspaces/${workspaceId}/invites` : null, mapInvite, true);
}

export function useDepartments(workspaceId: string): TCollectionState<IDepartmentRow> {
  return useCollection(`workspaces/${workspaceId}/departments`, mapDepartment);
}

/*
 * Department mutations are direct Firestore writes — firestore.rules allows
 * owner/admin to manage departments (unlike invites/members, which are
 * callable-only). The doc shape must satisfy validDepartment().
 */

export async function createDepartment(
  workspaceId: string,
  name: string,
  uid: string,
): Promise<void> {
  const ref = doc(collection(db, `workspaces/${workspaceId}/departments`));
  await setDoc(ref, {
    id: ref.id,
    name,
    createdAt: serverTimestamp(),
    createdBy: uid,
    memberCount: 0,
  });
}

export async function renameDepartment(
  workspaceId: string,
  departmentId: string,
  name: string,
): Promise<void> {
  await updateDoc(doc(db, `workspaces/${workspaceId}/departments/${departmentId}`), { name });
}

/** Rules reject this unless memberCount is 0 — disable the button client-side too. */
export async function deleteDepartment(workspaceId: string, departmentId: string): Promise<void> {
  await deleteDoc(doc(db, `workspaces/${workspaceId}/departments/${departmentId}`));
}
