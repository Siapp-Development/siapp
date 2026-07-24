/**
 * Live Firestore subscription + direct writes for the collaborators surface
 * (#16). CRUD is client-side (rules-validated for owner/admin/pm); removal
 * is archival via `status` — no hard delete (task assignees + phoneIndex
 * refs would orphan). notificationsOptOut and lastTaskAt are server-only.
 */

import type { TCollaboratorStatus, TCollaboratorType } from '@siapp/shared';
import {
  Timestamp,
  collection,
  deleteField,
  doc,
  onSnapshot,
  serverTimestamp,
  setDoc,
  updateDoc,
  type DocumentData,
} from 'firebase/firestore';
import { useEffect, useState } from 'react';

import { db } from '@/lib/firebase.ts';

import type { TCollectionState } from '../settings/useTeamData.ts';

export interface ICollaboratorRow {
  id: string;
  name: string;
  phone: string;
  email: string;
  company: string;
  trade: string;
  type: TCollaboratorType;
  status: TCollaboratorStatus;
  notificationsOptOut: boolean;
  lastTaskAt: Date | null;
}

function mapCollaborator(id: string, data: DocumentData): ICollaboratorRow {
  return {
    id,
    name: String(data['name'] ?? ''),
    phone: typeof data['phone'] === 'string' ? data['phone'] : '',
    email: typeof data['email'] === 'string' ? data['email'] : '',
    company: typeof data['company'] === 'string' ? data['company'] : '',
    trade: typeof data['trade'] === 'string' ? data['trade'] : '',
    type: data['type'] === 'company' ? 'company' : 'individual',
    status: data['status'] === 'archived' ? 'archived' : 'active',
    notificationsOptOut: data['notificationsOptOut'] === true,
    lastTaskAt: data['lastTaskAt'] instanceof Timestamp ? data['lastTaskAt'].toDate() : null,
  };
}

export function useCollaborators(workspaceId: string): TCollectionState<ICollaboratorRow> {
  const [state, setState] = useState<TCollectionState<ICollaboratorRow>>({ status: 'loading' });

  useEffect(() => {
    setState({ status: 'loading' });
    return onSnapshot(
      collection(db, `workspaces/${workspaceId}/collaborators`),
      (snapshot) => {
        const rows = snapshot.docs.map((docSnap) => mapCollaborator(docSnap.id, docSnap.data()));
        rows.sort((a, b) => a.name.localeCompare(b.name));
        setState({ status: 'ready', rows });
      },
      () => setState({ status: 'error' }),
    );
  }, [workspaceId]);

  return state;
}

export interface ICollaboratorFormValues {
  name: string;
  /** Already normalized to E.164 by the form (normalizePhone). */
  phone: string;
  email: string;
  company: string;
  trade: string;
  type: TCollaboratorType;
}

/** Creates an active collaborator; shape must satisfy the #16 create rule. */
export async function createCollaborator(
  workspaceId: string,
  values: ICollaboratorFormValues,
  uid: string,
): Promise<string> {
  const ref = doc(collection(db, `workspaces/${workspaceId}/collaborators`));
  await setDoc(ref, {
    id: ref.id,
    name: values.name,
    phone: values.phone,
    ...(values.email !== '' ? { email: values.email } : {}),
    ...(values.company !== '' ? { company: values.company } : {}),
    ...(values.trade !== '' ? { trade: values.trade } : {}),
    type: values.type,
    status: 'active',
    createdAt: serverTimestamp(),
    invitedBy: uid,
  });
  return ref.id;
}

/** Edits the firm-editable fields; identity + server-only fields untouched. */
export async function updateCollaborator(
  workspaceId: string,
  collaboratorId: string,
  values: ICollaboratorFormValues,
): Promise<void> {
  await updateDoc(doc(db, `workspaces/${workspaceId}/collaborators/${collaboratorId}`), {
    name: values.name,
    phone: values.phone,
    email: values.email !== '' ? values.email : deleteField(),
    company: values.company !== '' ? values.company : deleteField(),
    trade: values.trade !== '' ? values.trade : deleteField(),
    type: values.type,
  });
}

/** Archives or reactivates a collaborator (decision 3 — no hard delete). */
export async function setCollaboratorStatus(
  workspaceId: string,
  collaboratorId: string,
  status: TCollaboratorStatus,
): Promise<void> {
  await updateDoc(doc(db, `workspaces/${workspaceId}/collaborators/${collaboratorId}`), {
    status,
  });
}
