import type { TNotificationTrigger } from './enums.ts';

export const APPROVED_TEMPLATE_TRIGGERS = [
  'project_welcome',
  'task_status_change',
  'task_due_soon',
  'task_blocked',
  'collab_access_link',
] as const;

export type TApprovedTemplateTrigger = (typeof APPROVED_TEMPLATE_TRIGGERS)[number];

export interface IApprovedWhatsappTemplate {
  templateName: string;
  contentSid: string;
  variables: readonly string[];
  body: string;
}

/**
 * Must equal the approved Twilio Content Template. When a template is
 * re-approved under a new SID or wording, add a new versioned entry and keep
 * the old one intact for preview/version comparisons.
 */
export const WA_APPROVED_TEMPLATES = {
  project_welcome: {
    templateName: 'siapp_project_welcome_v1_en',
    contentSid: 'HX7e1ed9a3bc978cfed1089797b44315c0',
    variables: ['client_first_name', 'firm_name', 'project_title', 'project_due_date', 'portal_token'],
    body: `Hi {{client_first_name}}, your project with {{firm_name}} is now set up on Siapp.

Project: *{{project_title}}*
Target completion: {{project_due_date}}

Track progress using your secure link:
https://siapp.app/p/{{portal_token}}

If you were not expecting this, you can ignore this message.`,
  },
  task_status_change: {
    templateName: 'siapp_task_status_change_v1_en',
    contentSid: 'HXda96d4da436c0efe5873c483860ec1d2',
    variables: ['firm_name', 'project_title', 'task_title', 'new_status', 'portal_token'],
    body: `Update from {{firm_name}} on *{{project_title}}*:

*{{task_title}}* is now *{{new_status}}*.

View full progress on your tracker:
https://siapp.app/p/{{portal_token}}

— Sent via Siapp`,
  },
  task_due_soon: {
    templateName: 'siapp_task_due_soon_v1_en',
    contentSid: 'HX7002fc2be96fb62aa025f87cffe48a6e',
    variables: ['firm_name', 'task_title', 'project_title', 'due_date'],
    body: `Reminder from {{firm_name}}:

*{{task_title}}* on {{project_title}} is due {{due_date}}.

— Sent via Siapp`,
  },
  task_blocked: {
    templateName: 'siapp_task_blocked_v1_en',
    contentSid: 'HXafc525975ec283bc05547af1fe695859',
    variables: ['firm_name', 'project_title', 'task_title', 'blocked_reason', 'portal_token'],
    body: `Update from {{firm_name}} on *{{project_title}}*:

*{{task_title}}* is on hold. Reason: {{blocked_reason}}.

Follow progress on your tracker:
https://siapp.app/p/{{portal_token}}

— Sent via Siapp`,
  },
  collab_access_link: {
    templateName: 'siapp_collab_access_link_v1_en',
    contentSid: 'HX63e9cd015c54842e567b7af4070d407b',
    variables: ['collaborator_name', 'firm_name', 'access_token'],
    body: `Hi {{collaborator_name}}, your firm {{firm_name}} has added you as a collaborator on Siapp.

Use your secure link to view assigned tasks and post updates:
https://siapp.app/t/{{access_token}}

If you were not expecting this, you can ignore this message.`,
  },
} as const satisfies Record<TApprovedTemplateTrigger, IApprovedWhatsappTemplate>;

export const WA_LINK_PLACEHOLDERS = {
  access_token: '[private task-page link]',
  portal_token: '[private client portal link]',
} as const;

export function templateForTrigger(trigger: TNotificationTrigger): IApprovedWhatsappTemplate | null {
  return Object.hasOwn(WA_APPROVED_TEMPLATES, trigger)
    ? WA_APPROVED_TEMPLATES[trigger as TApprovedTemplateTrigger]
    : null;
}
