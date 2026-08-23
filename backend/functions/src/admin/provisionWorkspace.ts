/**
 * `adminProvisionWorkspace` callable — creates a new workspace, its first
 * owner member, and a vertical-specific starter project (D-031).
 *
 * Guarded by `assertAdminCall` (isAdmin claim + IP allowlist).
 * All writes use the Firebase Admin SDK (bypasses Firestore security rules).
 */

import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import { HttpsError, type CallableRequest } from 'firebase-functions/v2/https';

import type { TWorkspacePlan } from './adminTypes.js';
import { assertAdminCall, callerIp } from './adminGuard.js';
import { writeAdminLog } from './writeAdminLog.js';
import type { ISeedDefinition } from '../provisioning/seedTypes.js';
import { residentialBuildSeed } from '../provisioning/seeds/residentialBuild.js';
import { buildingApprovalSeed } from '../provisioning/seeds/buildingApproval.js';
import { conveyancingSeed } from '../provisioning/seeds/conveyancing.js';
import { writeStarterProject } from '../provisioning/writeStarterProject.js';

/** Starter-project template ids, keyed to their seed + parent vertical. */
export type TProvisionTemplate = 'residential-build' | 'building-approval' | 'conveyancing';

const TEMPLATE_SEEDS: Record<TProvisionTemplate, ISeedDefinition> = {
  'residential-build': residentialBuildSeed,
  'building-approval': buildingApprovalSeed,
  conveyancing: conveyancingSeed,
};

export interface IProvisionInput {
  workspaceName: string;
  /** URL-safe slug: /^[a-z0-9-]{3,40}$/ */
  workspaceSlug: string;
  /** Email of the first owner. Firebase Auth user is created if missing. */
  ownerEmail: string;
  seatLimit: number;
  plan: TWorkspacePlan;
  /** ISO 8601 date string, e.g. "2026-09-18" */
  planExpiresAt: string;
  vertical: 'construction' | 'legal';
  /**
   * Starter-project template. Optional for backwards compatibility — when
   * omitted, the vertical's default is used (construction →
   * residential-build, legal → conveyancing). Must belong to `vertical`.
   */
  template?: TProvisionTemplate;
}

export interface IProvisionResult {
  wid: string;
  pid: string;
}

const SLUG_RE = /^[a-z0-9-]{3,40}$/;

function validateInput(input: IProvisionInput): void {
  if (typeof input.workspaceName !== 'string' || input.workspaceName.trim() === '') {
    throw new HttpsError('invalid-argument', 'workspaceName is required');
  }
  if (typeof input.workspaceSlug !== 'string' || !SLUG_RE.test(input.workspaceSlug)) {
    throw new HttpsError(
      'invalid-argument',
      'workspaceSlug must match /^[a-z0-9-]{3,40}$/',
    );
  }
  if (typeof input.ownerEmail !== 'string' || !input.ownerEmail.includes('@')) {
    throw new HttpsError('invalid-argument', 'ownerEmail must be a valid email address');
  }
  if (
    typeof input.seatLimit !== 'number' ||
    !Number.isInteger(input.seatLimit) ||
    input.seatLimit < 1 ||
    input.seatLimit > 100
  ) {
    throw new HttpsError('invalid-argument', 'seatLimit must be an integer between 1 and 100');
  }
  if (!['trial', 'standard', 'business'].includes(input.plan)) {
    throw new HttpsError('invalid-argument', 'plan must be trial, standard, or business');
  }
  const expiresMs = Date.parse(input.planExpiresAt);
  if (Number.isNaN(expiresMs)) {
    throw new HttpsError('invalid-argument', 'planExpiresAt must be a valid ISO 8601 date string');
  }
  if (!['construction', 'legal'].includes(input.vertical)) {
    throw new HttpsError('invalid-argument', 'vertical must be construction or legal');
  }
  if (input.template !== undefined) {
    if (!(input.template in TEMPLATE_SEEDS)) {
      throw new HttpsError(
        'invalid-argument',
        'template must be residential-build, building-approval, or conveyancing',
      );
    }
    if (TEMPLATE_SEEDS[input.template].vertical !== input.vertical) {
      throw new HttpsError(
        'invalid-argument',
        `template "${input.template}" does not belong to the ${input.vertical} vertical`,
      );
    }
  }
}

export async function provisionWorkspace(
  request: CallableRequest<IProvisionInput>,
): Promise<IProvisionResult> {
  assertAdminCall(request);

  const input = request.data;
  validateInput(input);

  const db = getFirestore();
  const auth = getAuth();

  // Check slug uniqueness.
  const slugSnap = await db
    .collection('workspaces')
    .where('slug', '==', input.workspaceSlug)
    .limit(1)
    .get();
  if (!slugSnap.empty) {
    throw new HttpsError('already-exists', `Slug "${input.workspaceSlug}" is already in use`);
  }

  // Resolve or create the owner's Firebase Auth user.
  let ownerUid: string;
  let ownerName: string;
  let ownerPhotoUrl: string | undefined;
  try {
    const existingUser = await auth.getUserByEmail(input.ownerEmail);
    ownerUid = existingUser.uid;
    ownerName = existingUser.displayName ?? input.ownerEmail;
    ownerPhotoUrl = existingUser.photoURL ?? undefined;
  } catch (err: unknown) {
    const isNotFound =
      typeof err === 'object' &&
      err !== null &&
      'code' in err &&
      (err as { code: string }).code === 'auth/user-not-found';
    if (!isNotFound) {
      throw err;
    }
    // Create a new user without a password — they'll sign in via Google SSO
    // or receive an email-link invite in #11.
    const newUser = await auth.createUser({ email: input.ownerEmail });
    ownerUid = newUser.uid;
    ownerName = input.ownerEmail;
  }

  // Generate workspace id.
  const wid = db.collection('workspaces').doc().id;
  const now = FieldValue.serverTimestamp();
  const planExpiresAt = new Date(input.planExpiresAt);

  // Write workspace document.
  await db.doc(`workspaces/${wid}`).set({
    id: wid,
    name: input.workspaceName.trim(),
    slug: input.workspaceSlug,
    ownerId: ownerUid,
    plan: input.plan,
    planExpiresAt,
    seatLimit: input.seatLimit,
    seatsUsed: 1,
    branding: {},
    whatsappAllowance: {
      includedPerPeriod: 50 * input.seatLimit,
      periodStart: now,
      used: 0,
    },
    defaultLocale: 'en',
    createdAt: now,
    updatedAt: now,
  });

  // Write owner member document.
  // The existing `onWorkspaceMemberWrite` trigger will automatically sync
  // Firebase Auth custom claims for the owner.
  await db.doc(`workspaces/${wid}/members/${ownerUid}`).set({
    uid: ownerUid,
    email: input.ownerEmail,
    displayName: ownerName,
    // #104: seed the member-readable avatar denorm when the owner already has
    // a photo (omitted otherwise; the syncMemberProfile trigger fills it in on
    // the owner's first profile edit).
    ...(ownerPhotoUrl !== undefined ? { photoUrl: ownerPhotoUrl } : {}),
    role: 'owner',
    departments: [],
    seatActive: true,
    joinedAt: now,
    invitedBy: request.auth!.uid,
  });

  // Seed the starter project — explicit template, or the vertical default.
  const seed =
    input.template !== undefined
      ? TEMPLATE_SEEDS[input.template]
      : input.vertical === 'construction'
        ? residentialBuildSeed
        : conveyancingSeed;
  const pid = await writeStarterProject(wid, seed, ownerUid, ownerName);

  // Audit log.
  await writeAdminLog({
    actorUid: request.auth!.uid,
    actorEmail: (request.auth!.token as Record<string, string>)['email'] ?? '',
    action: 'workspace.provision',
    targetType: 'workspace',
    targetId: wid,
    after: {
      wid,
      slug: input.workspaceSlug,
      ownerUid,
      plan: input.plan,
      pid,
    },
    ip: callerIp(request),
  });

  return { wid, pid };
}
