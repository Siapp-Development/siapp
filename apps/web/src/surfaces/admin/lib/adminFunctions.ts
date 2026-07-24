/**
 * Typed `httpsCallable` wrappers for all Siapp admin Cloud Functions (#10).
 */

import { httpsCallable } from 'firebase/functions';
import type { TBillingStatus, TWorkspacePlan } from '@siapp/shared';

import { functions } from '@/lib/firebase.ts';

// ── Provision ───────────────────────────────────────────────────────────────

export interface IProvisionInput {
  workspaceName: string;
  workspaceSlug: string;
  ownerEmail: string;
  seatLimit: number;
  plan: TWorkspacePlan;
  /** ISO 8601 date string */
  planExpiresAt: string;
  vertical: 'construction' | 'legal';
}

export interface IProvisionResult {
  wid: string;
  pid: string;
}

export const provisionWorkspaceFn = httpsCallable<IProvisionInput, IProvisionResult>(
  functions,
  'adminProvisionWorkspace',
);

// ── Adjust ──────────────────────────────────────────────────────────────────

export interface IAdjustInput {
  wid: string;
  plan?: TWorkspacePlan;
  seatLimit?: number;
  /** ISO 8601 date string */
  planExpiresAt?: string;
  /** #24: founder read-only lever (trial expiry / lapsed renewals). */
  billingStatus?: TBillingStatus;
}

export interface IAdjustResult {
  ok: boolean;
}

export const adjustWorkspaceFn = httpsCallable<IAdjustInput, IAdjustResult>(
  functions,
  'adminAdjustWorkspace',
);

// ── Impersonate ─────────────────────────────────────────────────────────────

export interface IImpersonateInput {
  targetUid: string;
  reason: string;
}

export interface IImpersonateResult {
  customToken: string;
}

export const impersonateUserFn = httpsCallable<IImpersonateInput, IImpersonateResult>(
  functions,
  'adminImpersonateUser',
);
