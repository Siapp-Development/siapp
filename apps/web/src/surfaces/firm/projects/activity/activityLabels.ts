/**
 * Human labels for the #23 project activity timeline. Each entry becomes
 * "<actor> <text> <subject?>" — the subject (task/doc name) is emphasised by
 * the component, struck through for deleted docs (D-029 consequence).
 */

import type { TTaskStatus } from '@siapp/shared';

import { TASK_STATUS_LABELS } from '../tasks/taskLabels.ts';
import type { IActivityRow } from './useProjectActivity.ts';

/** D-027 badge for draft-suppressed notifications. */
export const WOULD_HAVE_NOTIFIED_BADGE = 'Would have notified — draft';

export interface IActivityLine {
  /** Actor display name ("A team member" for system entries). */
  actor: string;
  /** Sentence between actor and subject. */
  text: string;
  /** Emphasised task/doc name, or null when the sentence stands alone. */
  subject: string | null;
  /** Strikethrough the subject (deleted docs). */
  subjectStruck: boolean;
  /** Trailing detail after the subject (e.g. status / date transitions). */
  detail: string;
}

function statusLabel(value: string | null): string {
  return value !== null && value in TASK_STATUS_LABELS
    ? TASK_STATUS_LABELS[value as TTaskStatus]
    : (value ?? '');
}

function dateLabel(value: string | null): string {
  if (value === null || value === '') {
    return 'none';
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleDateString();
}

export function activityLine(row: IActivityRow): IActivityLine {
  const actor = row.actorName !== '' ? row.actorName : 'A team member';
  const task = row.taskTitle !== '' ? row.taskTitle : 'a task';
  const docName = row.docName !== '' ? row.docName : 'a document';
  switch (row.action) {
    case 'task_created':
      return { actor, text: 'created task', subject: task, subjectStruck: false, detail: '' };
    case 'task_status_changed':
      return {
        actor,
        text: 'changed',
        subject: task,
        subjectStruck: false,
        detail: `to ${statusLabel(row.to)}`,
      };
    case 'task_assigned':
      return {
        actor,
        text: `assigned ${row.to ?? 'someone'} to`,
        subject: task,
        subjectStruck: false,
        detail: '',
      };
    case 'task_unassigned':
      return {
        actor,
        text: `removed ${row.from ?? 'someone'} from`,
        subject: task,
        subjectStruck: false,
        detail: '',
      };
    case 'task_due_date_changed':
      return {
        actor,
        text: 'changed the due date of',
        subject: task,
        subjectStruck: false,
        detail: `from ${dateLabel(row.from)} to ${dateLabel(row.to)}`,
      };
    case 'task_deleted':
      return { actor, text: 'deleted task', subject: task, subjectStruck: true, detail: '' };
    case 'doc_added':
      return { actor, text: 'added document', subject: docName, subjectStruck: false, detail: '' };
    case 'client_document_uploaded':
      // Portal uploads are attributed to the client, not a firm member (#21).
      return {
        actor: 'The client',
        text: 'shared document',
        subject: docName,
        subjectStruck: false,
        detail: '',
      };
    case 'doc_deleted':
      return { actor, text: 'deleted document', subject: docName, subjectStruck: true, detail: '' };
    case 'project_created':
      return { actor, text: 'created the project', subject: null, subjectStruck: false, detail: '' };
    case 'project_published':
      return {
        actor,
        text: 'published the project',
        subject: null,
        subjectStruck: false,
        detail: '',
      };
    case 'project_completed':
      return {
        actor,
        text: 'marked the project completed',
        subject: null,
        subjectStruck: false,
        detail: '',
      };
    case 'project_archived':
      return {
        actor,
        text: 'archived the project',
        subject: null,
        subjectStruck: false,
        detail: '',
      };
    case 'project_deleted':
      return { actor, text: 'deleted the project', subject: null, subjectStruck: false, detail: '' };
    case 'project_reopened':
      return {
        actor,
        text: 'reopened the project',
        subject: null,
        subjectStruck: false,
        detail: '',
      };
    case 'client_link_changed':
      // System entry — attribution is unknown, so the sentence is neutral.
      return row.to === null
        ? {
            actor: 'Client',
            text: row.from !== null ? `${row.from} was unlinked` : 'was unlinked',
            subject: null,
            subjectStruck: false,
            detail: '',
          }
        : {
            actor: 'Client',
            text: 'set to',
            subject: row.to,
            subjectStruck: false,
            detail: '',
          };
  }
}
