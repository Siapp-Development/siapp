/**
 * Live Firestore subscription + direct writes for the collaborators surface
 * (#16). CRUD is client-side (rules-validated for owner/admin/pm); removal
 * is archival via `status` — no hard delete (task assignees + phoneIndex
 * refs would orphan). notificationsOptOut and lastTaskAt are server-only.
 * #26: waConsent capture (D1) rides along create/update; pdpaErased is
 * server-only (deletePersonalData) and read here to freeze the row's UI.
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

import { buildWaConsentRecord, consentWriteNeeded } from '../pdpa/consent.ts';
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
  /** Stored waConsent state; null = no record (#26 D2: absent = no consent). */
  waConsentGranted: boolean | null;
  waConsentRecordedAt: Date | null;
  /** Erased + frozen by deletePersonalData (#26 D3): row is read-only. */
  pdpaErased: boolean;
}

function mapCollaborator(id: string, data: DocumentData): ICollaboratorRow {
  const consent = data['waConsent'] as Record<string, unknown> | undefined;
  const hasConsentRecord = typeof consent === 'object' && consent !== null;
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
    waConsentGranted: hasConsentRecord ? consent['granted'] === true : null,
    waConsentRecordedAt:
      hasConsentRecord && consent['recordedAt'] instanceof Timestamp
        ? consent['recordedAt'].toDate()
        : null,
    pdpaErased: typeof data['pdpaErased'] === 'object' && data['pdpaErased'] !== null,
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
  /** #26 D1: state of the firm-attested consent checkbox. */
  waConsentGranted: boolean;
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
    // #26 D2: unchecked on create writes nothing — absent = no consent.
    // Collaborator docs carry no language preference; records default 'en'.
    ...(values.waConsentGranted ? { waConsent: buildWaConsentRecord(true, uid, 'en') } : {}),
    createdAt: serverTimestamp(),
    invitedBy: uid,
  });
  return ref.id;
}

/**
 * Edits the firm-editable fields; identity + server-only fields untouched.
 * A consent flip writes a fresh dated record (#26 D1) — never a delete.
 */
export async function updateCollaborator(
  workspaceId: string,
  collaboratorId: string,
  values: ICollaboratorFormValues,
  uid: string,
  storedConsentGranted: boolean | null,
): Promise<void> {
  await updateDoc(doc(db, `workspaces/${workspaceId}/collaborators/${collaboratorId}`), {
    name: values.name,
    phone: values.phone,
    email: values.email !== '' ? values.email : deleteField(),
    company: values.company !== '' ? values.company : deleteField(),
    trade: values.trade !== '' ? values.trade : deleteField(),
    type: values.type,
    ...(consentWriteNeeded(values.waConsentGranted, storedConsentGranted)
      ? { waConsent: buildWaConsentRecord(values.waConsentGranted, uid, 'en') }
      : {}),
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
