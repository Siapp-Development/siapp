/**
 * Live Firestore subscription + direct writes for the clients surface (#16).
 * CRUD is client-side (rules-validated for owner/admin/pm); no hard delete —
 * clients are edit-only at MVP. notificationsOptOut is server-only (D-035):
 * never written here, only surfaced as a read-only badge.
 * #26: waConsent capture (D1) rides along create/update; pdpaErased is
 * server-only (deletePersonalData) and read here to freeze the row's UI.
 */

import type { TLocale } from '@siapp/shared';
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

import { buildWaConsentRecord, consentWriteNeeded } from '../pdpa/consent.ts';
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
  /** Stored waConsent state; null = no record (#26 D2: absent = no consent). */
  waConsentGranted: boolean | null;
  waConsentRecordedAt: Date | null;
  /** Erased + frozen by deletePersonalData (#26 D3): row is read-only. */
  pdpaErased: boolean;
}

function consentFields(data: DocumentData): Pick<IClientRow, 'waConsentGranted' | 'waConsentRecordedAt'> {
  const consent = data['waConsent'] as Record<string, unknown> | undefined;
  if (typeof consent !== 'object' || consent === null) {
    return { waConsentGranted: null, waConsentRecordedAt: null };
  }
  return {
    waConsentGranted: consent['granted'] === true,
    waConsentRecordedAt:
      consent['recordedAt'] instanceof Timestamp ? consent['recordedAt'].toDate() : null,
  };
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
    ...consentFields(data),
    pdpaErased: typeof data['pdpaErased'] === 'object' && data['pdpaErased'] !== null,
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
  /** #26 D1: state of the firm-attested consent checkbox. */
  waConsentGranted: boolean;
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
    // #26 D2: unchecked on create writes nothing — absent = no consent.
    ...(values.waConsentGranted
      ? { waConsent: buildWaConsentRecord(true, uid, values.language) }
      : {}),
    createdAt: serverTimestamp(),
    createdBy: uid,
  });
  return ref.id;
}

/**
 * Edits the firm-editable fields; identity + opt-out stay untouched. A
 * consent flip writes a fresh dated record (#26 D1) — never a field delete.
 */
export async function updateClient(
  workspaceId: string,
  clientId: string,
  values: IClientFormValues,
  uid: string,
  storedConsentGranted: boolean | null,
): Promise<void> {
  await updateDoc(doc(db, `workspaces/${workspaceId}/clients/${clientId}`), {
    name: values.name,
    phone: values.phone,
    email: values.email !== '' ? values.email : deleteField(),
    companyName: values.companyName !== '' ? values.companyName : deleteField(),
    language: values.language,
    notes: values.notes !== '' ? values.notes : deleteField(),
    ...(consentWriteNeeded(values.waConsentGranted, storedConsentGranted)
      ? { waConsent: buildWaConsentRecord(values.waConsentGranted, uid, values.language) }
      : {}),
  });
}
