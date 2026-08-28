/**
 * Notification payload types — variables passed to WhatsApp template sends.
 * Every template variable set lives here so both the API and the front-end
 * can share the shapes.
 */

import type { TNotificationTrigger } from './enums.ts';

export interface IBaseTemplateVars {
  /** WhatsApp Business Account template name, e.g. "project_welcome_v2" */
  templateName: string;
  trigger: TNotificationTrigger;
  firmName: string;
  firmWaPhone: string;
}

export interface IProjectWelcomeVars extends IBaseTemplateVars {
  trigger: 'project_welcome';
  clientFirstName: string;
  clientFullName: string;
  projectTitle: string;
  projectDueDate: string;
  /**
   * #137: token-only — the bare `{shortCode}_{secret}` portal token, NOT a full
   * URL. The static `https://siapp.app/p/` prefix is baked into the template
   * body; the emitted `variables` map uses the snake_case key `portal_token`.
   */
  portalToken: string;
}

export interface ITaskAssignedVars extends IBaseTemplateVars {
  trigger: 'task_assigned';
  collaboratorName: string;
  taskTitle: string;
  projectTitle: string;
  dueDate?: string;
  taskLink: string;
}

export interface ITaskStatusChangeVars extends IBaseTemplateVars {
  trigger: 'task_status_change';
  taskTitle: string;
  newStatus: string;
  projectTitle: string;
}

export interface ITaskDueSoonVars extends IBaseTemplateVars {
  trigger: 'task_due_soon';
  taskTitle: string;
  dueDate: string;
  projectTitle: string;
  taskLink: string;
}

export interface ITaskBlockedVars extends IBaseTemplateVars {
  trigger: 'task_blocked';
  taskTitle: string;
  projectTitle: string;
}

export interface INeedHelpVars extends IBaseTemplateVars {
  trigger: 'need_help';
  collaboratorName: string;
  taskTitle: string;
  reason: string;
  projectTitle: string;
}

export interface IInboundAutoReplyVars extends IBaseTemplateVars {
  trigger: 'inbound_auto_reply';
  portalLink: string;
}

/**
 * #127: collaborator-scoped access link shared via WhatsApp. Maps to the
 * `collab_access_link_v1` template. Enqueue-only until the #19 dispatcher +
 * Twilio + Meta approval land.
 */
export interface ICollabAccessLinkVars extends IBaseTemplateVars {
  trigger: 'collab_access_link';
  collaboratorName: string;
  /**
   * #137: token-only — the bare `{shortCode}_{secret}` access token, NOT a full
   * URL. The static `https://siapp.app/t/` prefix is baked into the template
   * body; the emitted `variables` map uses the snake_case key `access_token`.
   */
  accessToken: string;
}

export type TTemplateVars =
  | IProjectWelcomeVars
  | ITaskAssignedVars
  | ITaskStatusChangeVars
  | ITaskDueSoonVars
  | ITaskBlockedVars
  | INeedHelpVars
  | IInboundAutoReplyVars
  | ICollabAccessLinkVars;
