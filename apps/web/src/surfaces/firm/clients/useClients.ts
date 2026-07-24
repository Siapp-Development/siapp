/**
 * Live Firestore subscription + direct writes for the clients surface (#16).
 * CRUD is client-side (rules-validated for owner/admin/pm); no hard delete —
 * clients are edit-only at MVP. notificationsOptOut is server-only (D-035):
 * never written here, only surfaced as a read-only badge.
 */

import type { TLocale } from '@siapp/shared';
import {
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

export interface IClientRow {
  id: string;
  name: string;
  phone: string;
  email: string;
  companyName: string;
  language: TLocale;
  notes: string;
  notificationsOptOut: boolean;
}

function mapClient(id: string, data: DocumentData): IClientRow {
  return {
    id,
    name: String(data['name'] ?? ''),
    phone: typeof data['phone'] === 'string' ? data['phone'] : '',
    email: typeof data['email'] === 'string' ? data['email'] : '',
    companyName: typeof data['companyName'] === 'string' ? data['companyName'] : '',
    language: data['language'] === 'ms' ? 'ms' : 'en',
    notes: typeof data['notes'] === 'string' ? data['notes'] : '',
    notificationsOptOut: data['notificationsOptOut'] === true,
  };
}

export function useClients(workspaceId: string): TCollectionState<IClientRow> {
  const [state, setState] = useState<TCollectionState<IClientRow>>({ status: 'loading' });

  useEffect(() => {
    setState({ status: 'loading' });
    return onSnapshot(
      collection(db, `workspaces/${workspaceId}/clients`),
      (snapshot) => {
        const rows = snapshot.docs.map((docSnap) => mapClient(docSnap.id, docSnap.data()));
        rows.sort((a, b) => a.name.localeCompare(b.name));
        setState({ status: 'ready', rows });
      },
      () => setState({ status: 'error' }),
    );
  }, [workspaceId]);

  return state;
}

export interface IClientFormValues {
  name: string;
  /** Already normalized to E.164 by the form (normalizePhone). */
  phone: string;
  email: string;
  companyName: string;
  language: TLocale;
  notes: string;
}

/** Creates a client; the doc shape must satisfy the #16 create rule. */
export async function createClient(
  workspaceId: string,
  values: IClientFormValues,
  uid: string,
): Promise<string> {
  const ref = doc(collection(db, `workspaces/${workspaceId}/clients`));
  await setDoc(ref, {
    id: ref.id,
    name: values.name,
    phone: values.phone,
    ...(values.email !== '' ? { email: values.email } : {}),
    ...(values.companyName !== '' ? { companyName: values.companyName } : {}),
    language: values.language,
    ...(values.notes !== '' ? { notes: values.notes } : {}),
    createdAt: serverTimestamp(),
    createdBy: uid,
  });
  return ref.id;
}

/** Edits the firm-editable fields; identity + opt-out stay untouched. */
export async function updateClient(
  workspaceId: string,
  clientId: string,
  values: IClientFormValues,
): Promise<void> {
  await updateDoc(doc(db, `workspaces/${workspaceId}/clients/${clientId}`), {
    name: values.name,
    phone: values.phone,
    email: values.email !== '' ? values.email : deleteField(),
    companyName: values.companyName !== '' ? values.companyName : deleteField(),
    language: values.language,
    notes: values.notes !== '' ? values.notes : deleteField(),
  });
}
