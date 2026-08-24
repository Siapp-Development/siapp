/**
 * `adminGetWorkspaceOwner` callable (#113) — resolves a workspace's owner
 * (`ownerId` Firebase Auth UID) to a `{ uid, displayName, email }` projection
 * for the admin Workspace detail page.
 *
 * Guarded by `assertAdminCall`. `IWorkspaceDoc` only stores `ownerId`; the
 * owner's name/email live on the owner member doc
 * (`/workspaces/{wid}/members/{ownerId}`) and `/users/{ownerId}`, both
 * unreadable by the admin client per Firestore rules (D-025). This callable
 * reads them Admin-SDK-side: owner member doc first (denormalised name/email),
 * with a `getAuth().getUser(ownerId)` fallback and a clean "unresolved" state
 * when the owner is deleted / has no member doc.
 *
 * Read-only ⇒ no `writeAdminLog`/`writeAuditLog` (only mutations +
 * impersonation are logged today).
 */

import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { HttpsError, type CallableRequest } from 'firebase-functions/v2/https';

import { assertAdminCall } from './adminGuard.js';

export interface IGetWorkspaceOwnerInput {
  wid: string;
}

export interface IWorkspaceOwner {
  /** = workspace.ownerId (always returned; '' when the workspace has no owner). */
  uid: string;
  /** null when unresolvable. */
  displayName: string | null;
  /** null when unresolvable. */
  email: string | null;
  source: 'member' | 'auth' | 'unresolved';
  /** true when `getAuth().getUser` reported the auth user no longer exists. */
  authUserDeleted: boolean;
}

/** Minimal shape of the fields we read from the owner member doc. */
export interface IOwnerMemberData {
  displayName?: string | null;
  email?: string | null;
}

/** Minimal shape of the fields we read from the Firebase Auth user record. */
export interface IOwnerAuthData {
  displayName?: string | null;
  email?: string | null;
}

/**
 * Pure resolver: given the owner's uid plus whichever source resolved (member
 * doc, auth record, or neither), produce the DTO. Unit-testable without
 * Firestore/Auth.
 *
 * Precedence: member doc → auth record → unresolved.
 */
export function resolveOwner(
  uid: string,
  member: IOwnerMemberData | null,
  authUser: IOwnerAuthData | null,
  authUserDeleted: boolean,
): IWorkspaceOwner {
  if (member !== null) {
    return {
      uid,
      displayName: member.displayName ?? null,
      email: member.email ?? null,
      source: 'member',
      authUserDeleted: false,
    };
  }

  if (authUser !== null) {
    return {
      uid,
      displayName: authUser.displayName ?? null,
      email: authUser.email ?? null,
      source: 'auth',
      authUserDeleted: false,
    };
  }

  return {
    uid,
    displayName: null,
    email: null,
    source: 'unresolved',
    authUserDeleted,
  };
}

export async function getWorkspaceOwner(
  request: CallableRequest<IGetWorkspaceOwnerInput>,
): Promise<IWorkspaceOwner> {
  assertAdminCall(request);

  const { wid } = request.data;

  if (typeof wid !== 'string' || wid.trim() === '') {
    throw new HttpsError('invalid-argument', 'wid is required');
  }

  const db = getFirestore();
  const wsSnap = await db.doc(`workspaces/${wid}`).get();

  if (!wsSnap.exists) {
    throw new HttpsError('not-found', `Workspace ${wid} not found`);
  }

  const ownerId = (wsSnap.data() as { ownerId?: unknown }).ownerId;

  if (typeof ownerId !== 'string' || ownerId.trim() === '') {
    return resolveOwner('', null, null, false);
  }

  // Prefer the denormalised owner member doc (fast, no Auth round-trip).
  const memberSnap = await db.doc(`workspaces/${wid}/members/${ownerId}`).get();
  if (memberSnap.exists) {
    const data = memberSnap.data() as IOwnerMemberData;
    return resolveOwner(ownerId, data, null, false);
  }

  // Fallback: read the Firebase Auth record (legacy/edge without a member doc).
  let authUser: IOwnerAuthData | null = null;
  let authUserDeleted = false;
  try {
    const user = await getAuth().getUser(ownerId);
    authUser = { displayName: user.displayName ?? null, email: user.email ?? null };
  } catch (err: unknown) {
    const isNotFound =
      typeof err === 'object' &&
      err !== null &&
      'code' in err &&
      (err as { code: string }).code === 'auth/user-not-found';
    if (isNotFound) {
      authUserDeleted = true;
    } else {
      throw err;
    }
  }

  return resolveOwner(ownerId, null, authUser, authUserDeleted);
}
