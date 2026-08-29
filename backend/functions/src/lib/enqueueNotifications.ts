/**
 * Notification enqueue pipeline (#18). Turns a task event into queue records
 * in the server-only `workspaces/{wid}/messages` collection (D3) applying
 * the D8 decision table:
 *
 *   toggle/trigger/recipient off  → no record at all
 *   project not published         → suppressed 'lifecycle:<state>' (D-027 preview)
 *   recipient opted out           → suppressed 'opt_out'
 *   client without waConsent      → suppressed 'no_consent' (#26 D2; members exempt)
 *   recipient unresolvable        → suppressed 'no_recipient' | 'no_phone'
 *   inside quiet hours            → queued + holdUntil = next window end
 *   otherwise                     → queued, no holdUntil
 *
 * No message is SENT here — #19's dispatcher consumes
 * `status == 'queued' && suppressed != true && (holdUntil absent || <= now)`
 * (D9 contract). Planning is pure (`planTaskNotifications`) so it
 * unit-tests without emulators; `enqueueTaskEvent` adds the Admin-SDK reads
 * and writes.
 */

import { getFirestore } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions';

import { isOptedOut } from './optOut.js';
import { hasWaConsent } from './pdpa.js';
import { holdUntilFor, mytDateString, resolveQuietHours, type IQuietHours } from './quietHours.js';
import { resolveNotify, type ITaskNotifyConfig } from './notifyConfig.js';
import { getOrCreateClientPortalLink } from '../callables/issuePortalLink.js';

// Mirrors WA_UTILITY_COST_MYR in @siapp/shared (source-only package this
// NodeNext build cannot consume) — pm_ux/plans/21-cost-estimation.md §2.8.
const WA_UTILITY_COST_MYR = 0.1;

export type TTaskTrigger = 'task_status_change' | 'task_blocked' | 'task_due_soon';

const TRIGGER_TO_NOTIFY_KEY: Record<TTaskTrigger, keyof ITaskNotifyConfig> = {
  task_status_change: 'statusChange',
  task_blocked: 'blocked',
  task_due_soon: 'dueSoon',
};

const TEMPLATE_NAMES: Record<TTaskTrigger, string> = {
  task_status_change: 'task_status_change_v1',
  task_blocked: 'task_blocked_v1',
  task_due_soon: 'task_due_soon_v1',
};

/**
 * Routing overrides that ignore the workspace toClient/toInternal toggles for
 * the trigger-scoped decisions locked in #137/#142. Returns a fresh object — the
 * stored config is never mutated.
 *
 * - `task_due_soon` (#137 Part D): INTERNAL-only — always the task's member
 *   assignees, never the client (link-less).
 * - `task_status_change` / `task_blocked` (#142 Part B, Q4): CLIENT-only — these
 *   carry the client durable portal link, so force toInternal OFF (a firm member
 *   must never receive a client-portal-link template with an empty/em-dash
 *   `portal_token`) and toClient ON.
 */
function effectiveNotifyFor(trigger: TTaskTrigger, notify: ITaskNotifyConfig): ITaskNotifyConfig {
  if (trigger === 'task_due_soon') {
    return { ...notify, toClient: false, toInternal: true };
  }
  return { ...notify, toClient: true, toInternal: false };
}

export interface IPlannedMessage {
  /** Deterministic doc id (due-soon dedupe, D5); null = auto id. */
  id: string | null;
  data: Record<string, unknown>;
}

export interface IPlanTaskNotificationsInput {
  trigger: TTaskTrigger;
  projectId: string;
  taskId: string;
  taskData: Record<string, unknown>;
  projectData: Record<string, unknown> | undefined;
  /** Linked client doc data; undefined when unlinked or the doc is missing. */
  clientData: Record<string, unknown> | undefined;
  /** `users/{uid}` data per firm-member assignee; undefined = missing doc. */
  memberProfiles: ReadonlyMap<string, Record<string, unknown> | undefined>;
  quietHours: IQuietHours;
  firmName: string;
  /** #24 D2: read-only workspace — every record suppressed 'billing'. */
  billingReadOnly?: boolean;
  /**
   * #142 (Part B): the resolved durable client portal token
   * (`{shortCode}_{secret}`) embedded as `portal_token` for the CLIENT-facing
   * `task_status_change` / `task_blocked` templates. Resolved ONCE per event by
   * `enqueueTaskEvent` (system actor) only when the project is published and a
   * sendable client exists; undefined/empty otherwise (those records never send).
   */
  clientPortalToken?: string;
  now: Date;
}

interface IRecipient {
  type: 'client' | 'member';
  id: string;
  phone: string | null;
  optedOut: boolean;
  /**
   * #26 D2: the recipient's doc is in hand but carries no waConsent grant.
   * Only ever true for clients/collaborators — members are exempt (contract
   * basis). A missing doc stays 'no_recipient' (cannot prove either way).
   */
  noConsent: boolean;
  /** Suppression when the recipient cannot be resolved at all. */
  unresolvableReason: 'no_recipient' | 'no_phone' | null;
}

function phoneOf(data: Record<string, unknown> | undefined): string | null {
  const value = data?.['phone'];
  return typeof value === 'string' && value !== '' ? value : null;
}

function resolveRecipients(input: IPlanTaskNotificationsInput, notify: ITaskNotifyConfig): IRecipient[] {
  const recipients: IRecipient[] = [];

  if (notify.toClient) {
    const clientId = input.projectData?.['clientId'];
    const linked = typeof clientId === 'string' && clientId !== '';
    const phone = phoneOf(input.clientData);
    recipients.push({
      type: 'client',
      id: linked ? clientId : '',
      phone,
      optedOut: isOptedOut(input.clientData),
      noConsent: input.clientData !== undefined && !hasWaConsent(input.clientData),
      unresolvableReason: !linked || input.clientData === undefined
        ? 'no_recipient'
        : phone === null
          ? 'no_phone'
          : null,
    });
  }

  if (notify.toInternal) {
    const assignees = input.taskData['assignees'];
    const seen = new Set<string>();
    for (const entry of Array.isArray(assignees) ? assignees : []) {
      if (typeof entry !== 'object' || entry === null) {
        continue;
      }
      const assignee = entry as Record<string, unknown>;
      if (assignee['type'] !== 'user' || typeof assignee['id'] !== 'string') {
        continue;
      }
      const uid = assignee['id'];
      if (seen.has(uid)) {
        continue;
      }
      seen.add(uid);
      const profile = input.memberProfiles.get(uid);
      const phone = phoneOf(profile);
      recipients.push({
        type: 'member',
        id: uid,
        phone,
        optedOut: isOptedOut(profile),
        // Members receive notifications on a contract basis (#26 D2 exempt).
        noConsent: false,
        unresolvableReason: phone === null ? 'no_phone' : null,
      });
    }
  }

  return recipients;
}

function templateVariables(input: IPlanTaskNotificationsInput): Record<string, string> {
  const title = input.taskData['title'];
  const projectName = input.projectData?.['name'];
  // snake_case keys (#137 Part A): these ARE the wire contract — they must match
  // the approved Meta template's NAMED variables exactly (Finding 1). #142
  // (Part B): the CLIENT-facing status_change/blocked templates also emit the
  // bare durable `portal_token` (resolved in enqueueTaskEvent, empty when the
  // record is suppressed/draft — those never send).
  const variables: Record<string, string> = {
    task_title: typeof title === 'string' ? title : '',
    project_title: typeof projectName === 'string' ? projectName : '',
    firm_name: input.firmName,
  };
  if (input.trigger === 'task_status_change') {
    const status = input.taskData['status'];
    variables['new_status'] = typeof status === 'string' ? status : '';
    // #142 (Part B): bare durable client portal token; empty when unresolved.
    variables['portal_token'] = input.clientPortalToken ?? '';
  }
  if (input.trigger === 'task_blocked') {
    // #22 (D-d): the need-help reason lands in the task_blocked template.
    const reason = input.taskData['blockedReason'];
    variables['blocked_reason'] = typeof reason === 'string' ? reason : '';
    // #142 (Part B): bare durable client portal token; empty when unresolved.
    variables['portal_token'] = input.clientPortalToken ?? '';
  }
  if (input.trigger === 'task_due_soon') {
    const dueDate = input.taskData['dueDate'] as { toDate?: () => Date } | undefined;
    // Format in MYT — quiet-hours/dedupe semantics are Malaysia time (D6),
    // and a UTC date would show the wrong calendar day near midnight.
    variables['due_date'] =
      typeof dueDate?.toDate === 'function' ? mytDateString(dueDate.toDate()) : '';
  }
  return variables;
}

/**
 * The message docs a task event should write — empty when the task's config
 * says the event must not fire (first D8 row: no "would have" records).
 */
export function planTaskNotifications(input: IPlanTaskNotificationsInput): IPlannedMessage[] {
  if (input.taskData['sendWhatsapp'] !== true) {
    return [];
  }
  const notify = resolveNotify(input.taskData);
  if (!notify[TRIGGER_TO_NOTIFY_KEY[input.trigger]]) {
    return [];
  }
  // Part D: due-soon fans out to members only regardless of config; the
  // dueSoon enablement gate above still uses the real config.
  const effectiveNotify = effectiveNotifyFor(input.trigger, notify);

  const lifecycle = input.projectData?.['lifecycle'];
  const published = lifecycle === 'published';
  const variables = templateVariables(input);
  const holdUntil = holdUntilFor(input.now, input.quietHours);
  const dedupeDate = mytDateString(input.now);

  return resolveRecipients(input, effectiveNotify).map((recipient) => {
    const suppressedReason = input.billingReadOnly === true
      ? 'billing'
      : !published
        ? `lifecycle:${typeof lifecycle === 'string' ? lifecycle : 'draft'}`
        : recipient.optedOut
          ? 'opt_out'
          : recipient.noConsent
            ? 'no_consent'
            : recipient.unresolvableReason;

    // D5: deterministic id per task, recipient, and MYT day so re-runs and
    // overlapping sweep windows cannot double-enqueue.
    const id =
      input.trigger === 'task_due_soon'
        ? `dueSoon_${input.projectId}_${input.taskId}_${dedupeDate}_${recipient.type}_${recipient.id === '' ? 'none' : recipient.id}`
        : null;

    return {
      id,
      data: {
        channel: 'whatsapp',
        recipientPhone: recipient.phone ?? '',
        recipientType: recipient.type,
        recipientId: recipient.id,
        templateName: TEMPLATE_NAMES[input.trigger],
        variables,
        status: 'queued',
        trigger: input.trigger,
        ...(suppressedReason !== null
          ? { suppressed: true, suppressedReason }
          : holdUntil !== null
            ? { holdUntil }
            : {}),
        ...(id !== null ? { dedupeKey: id } : {}),
        costEstimateMyr: WA_UTILITY_COST_MYR,
        relatedTo: { type: 'task', id: input.taskId },
        createdAt: input.now,
      },
    };
  });
}

export interface IEnqueueTaskEventParams {
  workspaceId: string;
  projectId: string;
  taskId: string;
  trigger: TTaskTrigger;
  taskData: Record<string, unknown>;
  projectData: Record<string, unknown> | undefined;
  now?: Date;
}

/**
 * Resolves recipients/settings and writes the planned queue records.
 * Uses `create()` so deterministic due-soon ids dedupe silently (D5).
 * Returns the number of docs written.
 */
export async function enqueueTaskEvent(params: IEnqueueTaskEventParams): Promise<number> {
  const { workspaceId, projectId, taskId, trigger, taskData, projectData } = params;
  const now = params.now ?? new Date();

  // Cheap config short-circuit before any read (first D8 row).
  if (taskData['sendWhatsapp'] !== true) {
    return 0;
  }
  const notify = resolveNotify(taskData);
  if (!notify[TRIGGER_TO_NOTIFY_KEY[trigger]]) {
    return 0;
  }
  // Part D: recipient reads must follow the same internal-only override as
  // planning so due-soon always resolves member profiles (never the client).
  const effectiveNotify = effectiveNotifyFor(trigger, notify);

  const db = getFirestore();
  const workspaceSnap = await db.doc(`workspaces/${workspaceId}`).get();
  const workspaceData = workspaceSnap.data();

  const clientId = projectData?.['clientId'];
  const clientSnap =
    effectiveNotify.toClient && typeof clientId === 'string' && clientId !== ''
      ? await db.doc(`workspaces/${workspaceId}/clients/${clientId}`).get()
      : null;

  const memberProfiles = new Map<string, Record<string, unknown> | undefined>();
  if (effectiveNotify.toInternal) {
    const assignees = taskData['assignees'];
    const uids = new Set<string>();
    for (const entry of Array.isArray(assignees) ? assignees : []) {
      const assignee = entry as Record<string, unknown> | null;
      if (assignee?.['type'] === 'user' && typeof assignee['id'] === 'string') {
        uids.add(assignee['id']);
      }
    }
    await Promise.all(
      [...uids].map(async (uid) => {
        const snap = await db.doc(`users/${uid}`).get();
        memberProfiles.set(uid, snap.data());
      }),
    );
  }

  const firmName = typeof workspaceData?.['name'] === 'string' ? workspaceData['name'] : '';
  const clientData = clientSnap?.data();

  // #142 (Part B): resolve the client's ONE durable portal link ONCE per event
  // for the CLIENT-facing status_change/blocked templates — ONLY when the
  // project is published, the workspace can send, and a consented, phone-bearing
  // client exists (a suppressed record would never send, so no link is minted).
  // Get-or-create reuses the existing link, so two events for the same (project,
  // client) embed the SAME token (D-042). System actor (Q5): createdBy 'system',
  // no extra audit entry from the enqueue path.
  let clientPortalToken: string | undefined;
  if (
    (trigger === 'task_status_change' || trigger === 'task_blocked') &&
    projectData?.['lifecycle'] === 'published' &&
    workspaceData?.['billingStatus'] !== 'read_only' &&
    typeof clientId === 'string' &&
    clientId !== '' &&
    clientData !== undefined &&
    !isOptedOut(clientData) &&
    hasWaConsent(clientData) &&
    phoneOf(clientData) !== null
  ) {
    const link = await getOrCreateClientPortalLink(db, workspaceId, projectId, clientId, 'system');
    clientPortalToken = link.token;
  }

  const planned = planTaskNotifications({
    trigger,
    projectId,
    taskId,
    taskData,
    projectData,
    clientData,
    memberProfiles,
    quietHours: resolveQuietHours(workspaceData),
    firmName,
    billingReadOnly: workspaceData?.['billingStatus'] === 'read_only',
    clientPortalToken,
    now,
  });

  const messages = db.collection(`workspaces/${workspaceId}/messages`);
  let written = 0;
  for (const message of planned) {
    const ref = message.id !== null ? messages.doc(message.id) : messages.doc();
    try {
      await ref.create({ id: ref.id, ...message.data });
      written += 1;
    } catch (error) {
      // ALREADY_EXISTS (gRPC code 6) = the due-soon dedupe doing its job.
      if ((error as { code?: number }).code === 6) {
        logger.debug('enqueueTaskEvent: dedupe hit', { id: ref.id });
      } else {
        throw error;
      }
    }
  }
  return written;
}
