import { describe, expect, it } from 'vitest';

import { describeMessageStatus } from './messageStatus.ts';
import type { IMessageLogRow } from './types.ts';

const NOW = new Date('2026-10-11T12:00:00.000Z');

function makeRow(overrides: Partial<IMessageLogRow>): IMessageLogRow {
  return {
    id: 'msg-1',
    trigger: 'project_welcome',
    templateName: 'siapp_project_welcome_v1_en',
    contentSid: null,
    variables: {},
    status: 'queued',
    suppressed: false,
    suppressedReason: null,
    providerStatus: null,
    providerSid: 'SM123',
    errorCode: null,
    holdUntil: null,
    dispatchClaimedAt: null,
    dispatchAttempts: 0,
    sentAt: null,
    deliveredAt: null,
    failedAt: null,
    readAt: null,
    ...overrides,
  };
}

describe('describeMessageStatus', () => {
  it('prefers suppressed reasons over every other state', () => {
    expect(describeMessageStatus(makeRow({
      status: 'failed',
      suppressed: true,
      suppressedReason: 'no_consent',
      errorCode: 'invalid_to_number',
    }), NOW)).toEqual({
      label: 'Not sent',
      tone: 'warning',
      detail: 'No WhatsApp consent recorded',
    });
  });

  it('treats no_content_sid as not sent', () => {
    expect(describeMessageStatus(makeRow({
      status: 'failed',
      errorCode: 'no_content_sid',
      failedAt: new Date('2026-10-11T11:00:00.000Z'),
    }), NOW)).toEqual({
      label: 'Not sent',
      tone: 'warning',
      detail: 'No approved WhatsApp template for this message type',
      at: new Date('2026-10-11T11:00:00.000Z'),
    });
  });

  it('reports read messages', () => {
    const at = new Date('2026-10-11T10:00:00.000Z');
    expect(describeMessageStatus(makeRow({ status: 'read', readAt: at }), NOW)).toEqual({
      label: 'Read',
      tone: 'success',
      at,
    });
  });

  it('reports delivered messages', () => {
    const at = new Date('2026-10-11T10:05:00.000Z');
    expect(describeMessageStatus(makeRow({ status: 'delivered', deliveredAt: at }), NOW)).toEqual({
      label: 'Delivered',
      tone: 'success',
      at,
    });
  });

  it('reports undelivered provider failures separately from generic failures', () => {
    const at = new Date('2026-10-11T10:10:00.000Z');
    expect(describeMessageStatus(makeRow({
      status: 'failed',
      providerStatus: 'undelivered',
      errorCode: 'wa_message_undeliverable',
      failedAt: at,
    }), NOW)).toEqual({
      label: 'Not delivered',
      tone: 'danger',
      detail: "WhatsApp accepted it but couldn't deliver it: WhatsApp couldn't deliver the message",
      at,
    });
  });

  it('describes generic failures with the provider code', () => {
    const at = new Date('2026-10-11T10:15:00.000Z');
    expect(describeMessageStatus(makeRow({
      status: 'failed',
      errorCode: 'twilio_99999',
      failedAt: at,
    }), NOW)).toEqual({
      label: 'Failed',
      tone: 'danger',
      detail: 'Provider error (twilio_99999)',
      at,
    });
  });

  it('flags noop-provider sends with no provider SID', () => {
    const at = new Date('2026-10-11T10:20:00.000Z');
    expect(describeMessageStatus(makeRow({
      status: 'sent',
      providerSid: '',
      sentAt: at,
    }), NOW)).toEqual({
      label: 'Sent',
      tone: 'neutral',
      detail: 'Handed to WhatsApp — delivery not confirmed yet (no provider reference)',
      at,
    });
  });

  it('shows quiet-hours holds as scheduled', () => {
    const at = new Date('2026-10-11T12:30:00.000Z');
    const result = describeMessageStatus(makeRow({ holdUntil: at }), NOW);
    expect(result.label).toBe('Scheduled');
    expect(result.tone).toBe('warning');
    expect(result.at).toEqual(at);
    expect(result.detail).toContain('Quiet hours — sends after');
  });

  it('stops queued records after three stale attempts', () => {
    expect(describeMessageStatus(makeRow({
      dispatchAttempts: 3,
      dispatchClaimedAt: new Date('2026-10-11T11:50:00.000Z'),
    }), NOW)).toEqual({
      label: 'Not sent',
      tone: 'warning',
      detail: 'Sending stopped after 3 attempts — contact support',
    });
  });

  it('shows a fresh claim as sending', () => {
    expect(describeMessageStatus(makeRow({
      dispatchClaimedAt: new Date('2026-10-11T11:58:00.000Z'),
      dispatchAttempts: 1,
    }), NOW)).toEqual({
      label: 'Sending…',
      tone: 'neutral',
    });
  });

  it('defaults queued records to queued', () => {
    expect(describeMessageStatus(makeRow({}), NOW)).toEqual({
      label: 'Queued',
      tone: 'neutral',
      detail: 'Usually sends within a minute',
    });
  });
});
