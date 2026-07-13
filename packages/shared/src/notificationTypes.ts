/**
 * Notification payload types — variables passed to WhatsApp template sends.
 * Every template variable set lives here so both the API and the front-end
 * can share the shapes.
 */

import type { NotificationTrigger } from './enums.ts';

export interface BaseTemplateVars {
  /** WhatsApp Business Account template name, e.g. "project_welcome_v2" */
  templateName: string;
  trigger: NotificationTrigger;
  firmName: string;
  firmWaPhone: string;
}

export interface ProjectWelcomeVars extends BaseTemplateVars {
  trigger: 'project_welcome';
  clientFirstName: string;
  clientFullName: string;
  projectTitle: string;
  projectDueDate: string;
  portalLink: string;
}

export interface TaskAssignedVars extends BaseTemplateVars {
  trigger: 'task_assigned';
  collaboratorName: string;
  taskTitle: string;
  projectTitle: string;
  dueDate?: string;
  taskLink: string;
}

export interface TaskStatusChangeVars extends BaseTemplateVars {
  trigger: 'task_status_change';
  taskTitle: string;
  newStatus: string;
  projectTitle: string;
}

export interface TaskDueSoonVars extends BaseTemplateVars {
  trigger: 'task_due_soon';
  taskTitle: string;
  dueDate: string;
  projectTitle: string;
  taskLink: string;
}

export interface NeedHelpVars extends BaseTemplateVars {
  trigger: 'need_help';
  collaboratorName: string;
  taskTitle: string;
  reason: string;
  projectTitle: string;
}

export interface InboundAutoReplyVars extends BaseTemplateVars {
  trigger: 'inbound_auto_reply';
  portalLink: string;
}

export type TemplateVars =
  | ProjectWelcomeVars
  | TaskAssignedVars
  | TaskStatusChangeVars
  | TaskDueSoonVars
  | NeedHelpVars
  | InboundAutoReplyVars;
