import { describe, expect, it } from 'vitest';

import {
  APPROVED_TEMPLATE_TRIGGERS,
  WA_APPROVED_TEMPLATES,
} from '@siapp/shared';

import { approvedTemplatePlaceholders, renderMessagePreview } from './messagePreview.ts';
import type { IMessageLogRow } from './types.ts';

function makeRow(overrides: Partial<IMessageLogRow>): IMessageLogRow {
  return {
    id: 'msg-1',
    trigger: 'project_welcome',
    templateName: 'siapp_project_welcome_v1_en',
    contentSid: null,
    variables: {
      client_first_name: 'Aisha',
      collaborator_name: 'Ravi Kumar',
      due_date: '20 Oct 2026',
      firm_name: 'Siapp Studio',
      new_status: 'in_progress',
      portal_token: 'portal_secret_value',
      access_token: 'access_secret_value',
      blocked_reason: 'Missing permit',
      project_due_date: '28 Oct 2026',
      project_title: 'Kitchen renovation',
      task_title: 'Cabinet install',
    },
    status: 'sent',
    suppressed: false,
    suppressedReason: null,
    providerStatus: null,
    providerSid: 'SM123',
    errorCode: null,
    holdUntil: null,
    dispatchClaimedAt: null,
    dispatchAttempts: 0,
    sentAt: new Date('2026-10-11T12:00:00.000Z'),
    deliveredAt: null,
    failedAt: null,
    readAt: null,
    ...overrides,
  };
}

describe('approvedTemplatePlaceholders', () => {
  it('matches the declared variables for every approved template', () => {
    for (const trigger of APPROVED_TEMPLATE_TRIGGERS) {
      expect(approvedTemplatePlaceholders(trigger)).toEqual(WA_APPROVED_TEMPLATES[trigger].variables);
    }
  });
});

describe('renderMessagePreview', () => {
  it('renders every approved template with sample values', () => {
    expect(renderMessagePreview(makeRow({ trigger: 'project_welcome' })).text).toContain(
      'Hi Aisha, your project with Siapp Studio is now set up on Siapp.',
    );
    expect(renderMessagePreview(makeRow({ trigger: 'task_status_change' })).text).toContain(
      '*Cabinet install* is now *in_progress*.',
    );
    expect(renderMessagePreview(makeRow({ trigger: 'task_due_soon' })).text).toContain(
      '*Cabinet install* on Kitchen renovation is due 20 Oct 2026.',
    );
    expect(renderMessagePreview(makeRow({ trigger: 'task_blocked' })).text).toContain(
      '*Cabinet install* is on hold. Reason: Missing permit.',
    );
    expect(renderMessagePreview(makeRow({ trigger: 'collab_access_link' })).text).toContain(
      'Hi Ravi Kumar, your firm Siapp Studio has added you as a collaborator on Siapp.',
    );
  });

  it('masks client and collaborator links and never leaks token values', () => {
    const client = renderMessagePreview(makeRow({ trigger: 'project_welcome' }));
    const collaborator = renderMessagePreview(makeRow({ trigger: 'collab_access_link' }));

    expect(client.text).toContain('[private client portal link]');
    expect(client.text).not.toContain('portal_secret_value');
    expect(collaborator.text).toContain('[private task-page link]');
    expect(collaborator.text).not.toContain('access_secret_value');
  });

  it('uses em dash for empty values, preserves REDACTED, and accepts legacy camelCase keys', () => {
    const emptyValue = renderMessagePreview(makeRow({
      trigger: 'task_blocked',
      variables: {
        firmName: 'Siapp Studio',
        projectTitle: 'Kitchen renovation',
        taskTitle: 'Cabinet install',
        blockedReason: '',
        portalToken: 'secret',
      },
    }));
    const redacted = renderMessagePreview(makeRow({
      trigger: 'collab_access_link',
      variables: {
        collaborator_name: 'REDACTED',
        firm_name: 'Siapp Studio',
        access_token: 'secret',
      },
    }));

    expect(emptyValue.text).toContain('Reason: —.');
    expect(redacted.text).toContain('Hi REDACTED, your firm Siapp Studio has added you as a collaborator on Siapp.');
  });

  it('returns bold segments for WhatsApp markdown', () => {
    const preview = renderMessagePreview(makeRow({ trigger: 'task_status_change' }));
    expect(preview.kind).toBe('template');
    if (preview.kind !== 'template') {
      throw new Error('expected template preview');
    }
    expect(preview.segments).toEqual(
      expect.arrayContaining([
        { type: 'bold', text: 'Kitchen renovation' },
        { type: 'bold', text: 'Cabinet install' },
        { type: 'bold', text: 'in_progress' },
      ]),
    );
  });

  it('marks previews as inexact when the recorded content SID differs', () => {
    const preview = renderMessagePreview(makeRow({
      trigger: 'task_due_soon',
      contentSid: 'HX_older_template',
    }));

    expect(preview.kind).toBe('template');
    if (preview.kind !== 'template') {
      throw new Error('expected template preview');
    }
    expect(preview.exactVersion).toBe(false);
  });

  it('falls back without echoing variables for unapproved and unknown triggers', () => {
    const assigned = renderMessagePreview(makeRow({
      trigger: 'task_assigned',
      variables: { collaborator_name: 'Ravi Kumar', task_title: 'Secret task' },
    }));
    const unknown = renderMessagePreview(makeRow({
      trigger: 'inbound_auto_reply',
      variables: { firm_name: 'Siapp Studio' },
    }));

    expect(assigned).toEqual({
      kind: 'unavailable',
      text: 'No approved WhatsApp template for this message type — nothing was sent.',
    });
    expect(unknown).toEqual({
      kind: 'unavailable',
      text: 'No approved WhatsApp template for this message type — nothing was sent.',
    });
  });
});
