import type { IMessageLogRow } from './types.ts';

export type TMessageStatusTone = 'neutral' | 'success' | 'warning' | 'danger';

export interface IMessageStatusDescriptor {
  label: string;
  tone: TMessageStatusTone;
  detail?: string;
  at?: Date | null;
}

const FIVE_MINUTES_MS = 5 * 60 * 1000;

const ERROR_DETAILS: Record<string, string> = {
  invalid_to_number: 'Invalid WhatsApp number',
  no_content_sid: 'No approved WhatsApp template for this message type',
  twilio_error: 'Provider error',
  wa_channel_not_available: 'WhatsApp channel not available',
  wa_channel_not_found: 'WhatsApp channel not found',
  wa_message_undeliverable: "WhatsApp couldn't deliver the message",
  wa_outside_session_window: 'Outside the WhatsApp service window',
  wa_rate_limited: 'WhatsApp rate limited the request',
};

const SUPPRESSED_DETAILS: Record<string, string> = {
  billing: 'Workspace is read-only',
  duplicate_phone: 'Same number as another client — sent once',
  'lifecycle:archived': 'Project archived',
  'lifecycle:completed': 'Project completed',
  'lifecycle:deleted': 'Project deleted',
  'lifecycle:draft': 'Project not published',
  no_consent: 'No WhatsApp consent recorded',
  no_phone: 'No phone number',
  no_recipient: 'Recipient record missing',
  opt_out: 'Recipient opted out of WhatsApp',
};

function describeErrorCode(errorCode: string | null): string {
  if (errorCode === null || errorCode === '') {
    return 'Provider error';
  }
  if (errorCode in ERROR_DETAILS) {
    return ERROR_DETAILS[errorCode];
  }
  if (errorCode.startsWith('twilio_')) {
    return `Provider error (${errorCode})`;
  }
  return `Provider error (${errorCode})`;
}

function isFreshClaim(row: IMessageLogRow, now: Date): boolean {
  return row.dispatchClaimedAt !== null
    && now.getTime() - row.dispatchClaimedAt.getTime() < FIVE_MINUTES_MS;
}

export function describeMessageStatus(row: IMessageLogRow, now: Date): IMessageStatusDescriptor {
  if (row.suppressed) {
    return {
      label: 'Not sent',
      tone: 'warning',
      detail: row.suppressedReason !== null
        ? (SUPPRESSED_DETAILS[row.suppressedReason] ?? 'Not sent')
        : 'Not sent',
    };
  }

  if (row.status === 'failed' && row.errorCode === 'no_content_sid') {
    return {
      label: 'Not sent',
      tone: 'warning',
      detail: 'No approved WhatsApp template for this message type',
      at: row.failedAt,
    };
  }

  if (row.status === 'read') {
    return { label: 'Read', tone: 'success', at: row.readAt };
  }

  if (row.status === 'delivered') {
    return { label: 'Delivered', tone: 'success', at: row.deliveredAt };
  }

  if (
    row.status === 'failed'
    && (row.providerStatus === 'undelivered' || row.providerStatus === 'failed')
  ) {
    return {
      label: 'Not delivered',
      tone: 'danger',
      detail: `WhatsApp accepted it but couldn't deliver it: ${describeErrorCode(row.errorCode)}`,
      at: row.failedAt,
    };
  }

  if (row.status === 'failed') {
    return {
      label: 'Failed',
      tone: 'danger',
      detail: describeErrorCode(row.errorCode),
      at: row.failedAt,
    };
  }

  if (row.status === 'sent') {
    return {
      label: 'Sent',
      tone: 'neutral',
      detail: row.providerSid !== null && row.providerSid !== ''
        ? 'Handed to WhatsApp — delivery not confirmed yet'
        : 'Handed to WhatsApp — delivery not confirmed yet (no provider reference)',
      at: row.sentAt,
    };
  }

  if (row.status === 'queued' && row.holdUntil !== null && row.holdUntil.getTime() > now.getTime()) {
    return {
      label: 'Scheduled',
      tone: 'warning',
      detail: `Quiet hours — sends after ${row.holdUntil.toLocaleString()}`,
      at: row.holdUntil,
    };
  }

  if (row.status === 'queued' && row.dispatchAttempts >= 3 && !isFreshClaim(row, now)) {
    return {
      label: 'Not sent',
      tone: 'warning',
      detail: 'Sending stopped after 3 attempts — contact support',
    };
  }

  if (row.status === 'queued' && isFreshClaim(row, now)) {
    return { label: 'Sending…', tone: 'neutral' };
  }

  return {
    label: 'Queued',
    tone: 'neutral',
    detail: 'Usually sends within a minute',
  };
}
