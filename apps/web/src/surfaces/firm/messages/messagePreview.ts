import {
  WA_APPROVED_TEMPLATES,
  WA_LINK_PLACEHOLDERS,
  templateForTrigger,
  type TApprovedTemplateTrigger,
} from '@siapp/shared';

import type { IMessageLogRow } from './types.ts';

const TOKEN_NAME_PATTERN = /(?:_token|Token)$/;
const TOKEN_URL_PATTERN = /https?:\/\/\S*\{\{\s*([\w_]+)\s*\}\}\S*/g;
const PLACEHOLDER_PATTERN = /\{\{\s*([\w_]+)\s*\}\}/g;
const BOLD_PATTERN = /\*([^*]+)\*/g;

const LEGACY_VARIABLE_ALIASES: Record<string, readonly string[]> = {
  access_token: ['accessToken'],
  blocked_reason: ['blockedReason'],
  client_first_name: ['clientFirstName'],
  collaborator_name: ['collaboratorName'],
  due_date: ['dueDate'],
  firm_name: ['firmName'],
  new_status: ['newStatus'],
  portal_token: ['portalToken'],
  project_due_date: ['projectDueDate'],
  project_title: ['projectTitle'],
  task_title: ['taskTitle'],
};

export interface IMessagePreviewSegment {
  type: 'text' | 'bold';
  text: string;
}

export type TMessagePreview =
  | {
      kind: 'template';
      segments: IMessagePreviewSegment[];
      exactVersion: boolean;
      text: string;
    }
  | {
      kind: 'unavailable';
      text: string;
    };

function placeholderNames(body: string): string[] {
  const names = new Set<string>();
  body.replaceAll(PLACEHOLDER_PATTERN, (_match, name: string) => {
    names.add(name);
    return '';
  });
  return [...names];
}

function variableValue(variables: Record<string, string>, name: string): string {
  const direct = variables[name];
  if (typeof direct === 'string') {
    return direct !== '' ? direct : '—';
  }

  const aliases = LEGACY_VARIABLE_ALIASES[name] ?? [snakeToCamel(name)];
  for (const alias of aliases) {
    const value = variables[alias];
    if (typeof value === 'string') {
      return value !== '' ? value : '—';
    }
  }

  return TOKEN_NAME_PATTERN.test(name) ? '[private link]' : '—';
}

function snakeToCamel(value: string): string {
  return value.replace(/_([a-z])/g, (_match, letter: string) => letter.toUpperCase());
}

function maskedLinkLabel(name: string): string {
  if (name in WA_LINK_PLACEHOLDERS) {
    return WA_LINK_PLACEHOLDERS[name as keyof typeof WA_LINK_PLACEHOLDERS];
  }
  return '[private link]';
}

function maskTemplateLinks(body: string): string {
  return body.replaceAll(TOKEN_URL_PATTERN, (_match, name: string) => maskedLinkLabel(name));
}

function buildSegments(text: string): IMessagePreviewSegment[] {
  const segments: IMessagePreviewSegment[] = [];
  let lastIndex = 0;

  for (const match of text.matchAll(BOLD_PATTERN)) {
    const index = match.index ?? 0;
    if (index > lastIndex) {
      segments.push({ type: 'text', text: text.slice(lastIndex, index) });
    }
    segments.push({ type: 'bold', text: match[1] });
    lastIndex = index + match[0].length;
  }

  if (lastIndex < text.length) {
    segments.push({ type: 'text', text: text.slice(lastIndex) });
  }

  return segments.length > 0 ? segments : [{ type: 'text', text }];
}

export function messageTypeLabel(trigger: string): string {
  switch (trigger) {
    case 'project_welcome':
      return 'Portal link';
    case 'task_status_change':
      return 'Task update';
    case 'task_blocked':
      return 'Task on hold';
    case 'task_due_soon':
      return 'Due-soon reminder';
    case 'collab_access_link':
      return 'Task-page link';
    case 'task_assigned':
      return 'Task assigned';
    case 'need_help':
      return 'Help request';
    case 'wa_quota_90':
      return 'Usage alert';
    default:
      return 'WhatsApp message';
  }
}

export function renderMessagePreview(row: IMessageLogRow): TMessagePreview {
  const template = templateForTrigger(row.trigger);
  if (template === null) {
    return {
      kind: 'unavailable',
      text: 'No approved WhatsApp template for this message type — nothing was sent.',
    };
  }

  const text = maskTemplateLinks(template.body).replaceAll(PLACEHOLDER_PATTERN, (_match, name: string) =>
    variableValue(row.variables, name),
  );

  return {
    kind: 'template',
    segments: buildSegments(text),
    exactVersion: row.contentSid === null || row.contentSid === '' || row.contentSid === template.contentSid,
    text,
  };
}

export function approvedTemplatePlaceholders(
  trigger: TApprovedTemplateTrigger,
): readonly string[] {
  return placeholderNames(WA_APPROVED_TEMPLATES[trigger].body);
}
