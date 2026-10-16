/**
 * Shared Firestore envelope for on-demand portal and collaborator sends.
 * Purely builds a document; callers retain control over whether writes fail-soft.
 */

import type { Timestamp } from 'firebase-admin/firestore';

import type { TNotificationTrigger } from './contentSids.js';

export type TDirectSendSuppressedReason =
  'opt_out' | 'no_consent' | 'no_phone' | 'duplicate_phone' | 'no_recipient';

export interface IDirectSendRecordInput {
  id: string;
  recipientType: 'client' | 'collaborator';
  recipientId: string;
  recipientPhone: string;
  templateName: string;
  trigger: TNotificationTrigger;
  variables: Record<string, string>;
  costEstimateMyr: number;
  relatedTo: { type: 'project' | 'collaborator'; id: string };
  createdAt: Timestamp;
  suppressedReason?: TDirectSendSuppressedReason;
}

export interface IDirectSendRecord {
  id: string;
  channel: 'whatsapp';
  recipientType: 'client' | 'collaborator';
  recipientId: string;
  recipientPhone: string;
  templateName: string;
  trigger: TNotificationTrigger;
  variables: Record<string, string>;
  status: 'queued';
  costEstimateMyr: number;
  relatedTo: { type: 'project' | 'collaborator'; id: string };
  createdAt: Timestamp;
  restrictedToDepartments: string[];
  suppressed?: true;
  suppressedReason?: TDirectSendSuppressedReason;
}

/** Build the common queued / not-sent envelope for a direct send. */
export function buildDirectSendRecord(input: IDirectSendRecordInput): IDirectSendRecord {
  return {
    id: input.id,
    channel: 'whatsapp',
    recipientType: input.recipientType,
    recipientId: input.recipientId,
    recipientPhone: input.recipientPhone,
    templateName: input.templateName,
    trigger: input.trigger,
    variables: input.variables,
    status: 'queued',
    costEstimateMyr: input.costEstimateMyr,
    relatedTo: input.relatedTo,
    createdAt: input.createdAt,
    restrictedToDepartments: [],
    ...(input.suppressedReason !== undefined
      ? { suppressed: true as const, suppressedReason: input.suppressedReason }
      : {}),
  };
}
