/**
 * Render map for notification rows (#134), mirroring `activityLabels.ts`.
 * Each kind maps to an icon + a title/body builder. The deep-link is built
 * from `projectId`/`taskId` + the current `workspaceSlug` (never stored on the
 * doc) so a row lands on the existing task/project view.
 */

import {
  AlertTriangle,
  AtSign,
  Bell,
  CalendarClock,
  CheckCircle2,
  FileUp,
  FolderCheck,
  MessageSquare,
  Rocket,
  UserPlus,
  type LucideIcon,
} from 'lucide-react';

import type { INotificationRow } from './useNotifications.ts';

const ICONS: Record<INotificationRow['kind'], LucideIcon> = {
  mention: AtSign,
  task_assigned: UserPlus,
  task_comment: MessageSquare,
  task_status_changed: CheckCircle2,
  task_blocked: AlertTriangle,
  task_due_soon: CalendarClock,
  task_overdue: CalendarClock,
  client_document_uploaded: FileUp,
  collaborator_note_added: MessageSquare,
  collaborator_need_help: AlertTriangle,
  project_published: Rocket,
  project_completed: FolderCheck,
  project_archived: FolderCheck,
};

export function notificationIcon(kind: INotificationRow['kind']): LucideIcon {
  return ICONS[kind] ?? Bell;
}

export interface INotificationLine {
  /** Short sentence describing the event. */
  title: string;
  /** Secondary context (project / task / excerpt), or null when absent. */
  body: string | null;
}

function actorOf(row: INotificationRow): string {
  if (row.actorName !== '') {
    return row.actorName;
  }
  switch (row.actorType) {
    case 'client':
      return 'A client';
    case 'collaborator':
      return 'A collaborator';
    case 'system':
      return 'Siapp';
    default:
      return 'A team member';
  }
}

/** Task label with a graceful fallback. */
function taskOf(row: INotificationRow): string {
  return row.taskTitle ?? 'a task';
}

export function notificationLine(row: INotificationRow): INotificationLine {
  const actor = actorOf(row);
  const task = taskOf(row);
  const project = row.projectName !== '' ? row.projectName : 'a project';
  switch (row.kind) {
    case 'mention':
      return { title: `${actor} mentioned you on ${task}`, body: row.excerpt };
    case 'task_assigned':
      return { title: `${actor} assigned you to ${task}`, body: project };
    case 'task_comment':
      return { title: `${actor} commented on ${task}`, body: row.excerpt };
    case 'task_status_changed':
      return { title: `${actor} updated ${task}`, body: project };
    case 'task_blocked':
      return { title: `${task} is blocked`, body: row.excerpt ?? project };
    case 'task_due_soon':
      return { title: `${task} is due soon`, body: project };
    case 'task_overdue':
      return { title: `${task} is overdue`, body: project };
    case 'client_document_uploaded':
      return { title: `${actor} uploaded a document`, body: project };
    case 'collaborator_note_added':
      return { title: `${actor} added a note on ${task}`, body: row.excerpt ?? project };
    case 'collaborator_need_help':
      return { title: `${actor} needs help on ${task}`, body: row.excerpt ?? project };
    case 'project_published':
      return { title: `${project} was published`, body: null };
    case 'project_completed':
      return { title: `${project} was completed`, body: null };
    case 'project_archived':
      return { title: `${project} was archived`, body: null };
  }
}

/**
 * Deep link to the existing task/project view. Project-only when the
 * notification has no task (lifecycle events). Matches the `?task=` param
 * wiring `ProjectDetailPage` already reads.
 */
export function notificationDeepLink(
  workspaceSlug: string,
  projectId: string,
  taskId: string | null,
): string {
  const base = `/${workspaceSlug}/projects/${projectId}`;
  return taskId !== null ? `${base}?task=${taskId}` : base;
}
