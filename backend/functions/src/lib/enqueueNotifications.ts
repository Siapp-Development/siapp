/**
 * Notification enqueue pipeline (#18). Turns a task event into queue records
 * in the server-only `workspaces/{wid}/messages` collection (D3) applying
 * the D8 decision table:
 *
 *   toggle/trigger/recipient off  → no record at all
 *   project not published         → suppressed 'lifecycle:<state>' (D-027 preview)
 *   recipient opted out           → suppressed 'opt_out'
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
import { holdUntilFor, mytDateString, resolveQuietHours, type IQuietHours } from './quietHours.js';
import { resolveNotify, type ITaskNotifyConfig } from './notifyConfig.js';

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
  now: Date;
}

interface IRecipient {
  type: 'client' | 'member';
  id: string;
  phone: string | null;
  optedOut: boolean;
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
        unresolvableReason: phone === null ? 'no_phone' : null,
      });
    }
  }

  return recipients;
}

function templateVariables(input: IPlanTaskNotificationsInput): Record<string, string> {
  const title = input.taskData['title'];
  const projectName = input.projectData?.['name'];
  const variables: Record<string, string> = {
    taskTitle: typeof title === 'string' ? title : '',
    projectTitle: typeof projectName === 'string' ? projectName : '',
    firmName: input.firmName,
  };
  if (input.trigger === 'task_status_change') {
    const status = input.taskData['status'];
    variables['newStatus'] = typeof status === 'string' ? status : '';
  }
  if (input.trigger === 'task_blocked') {
    // #22 (D-d): the need-help reason lands in the task_blocked_v1 template.
    const reason = input.taskData['blockedReason'];
    variables['blockedReason'] = typeof reason === 'string' ? reason : '';
  }
  if (input.trigger === 'task_due_soon') {
    const dueDate = input.taskData['dueDate'] as { toDate?: () => Date } | undefined;
    variables['dueDate'] =
      typeof dueDate?.toDate === 'function' ? dueDate.toDate().toISOString().slice(0, 10) : '';
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

  const lifecycle = input.projectData?.['lifecycle'];
  const published = lifecycle === 'published';
  const variables = templateVariables(input);
  const holdUntil = holdUntilFor(input.now, input.quietHours);
  const dedupeDate = mytDateString(input.now);

  return resolveRecipients(input, notify).map((recipient) => {
    const suppressedReason = !published
      ? `lifecycle:${typeof lifecycle === 'string' ? lifecycle : 'draft'}`
      : recipient.optedOut
        ? 'opt_out'
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

  const db = getFirestore();
  const workspaceSnap = await db.doc(`workspaces/${workspaceId}`).get();
  const workspaceData = workspaceSnap.data();

  const clientId = projectData?.['clientId'];
  const clientSnap =
    notify.toClient && typeof clientId === 'string' && clientId !== ''
      ? await db.doc(`workspaces/${workspaceId}/clients/${clientId}`).get()
      : null;

  const memberProfiles = new Map<string, Record<string, unknown> | undefined>();
  if (notify.toInternal) {
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
  const planned = planTaskNotifications({
    trigger,
    projectId,
    taskId,
    taskData,
    projectData,
    clientData: clientSnap?.data(),
    memberProfiles,
    quietHours: resolveQuietHours(workspaceData),
    firmName,
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
