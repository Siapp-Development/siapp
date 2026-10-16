import type { TMessageStatus, TNotificationTrigger, TSuppressedReason } from '@siapp/shared';

export interface IMessageLogRow {
  id: string;
  trigger: TNotificationTrigger;
  templateName: string;
  contentSid: string | null;
  variables: Record<string, string>;
  status: TMessageStatus;
  suppressed: boolean;
  suppressedReason: TSuppressedReason | null;
  providerStatus: string | null;
  providerSid: string | null;
  errorCode: string | null;
  holdUntil: Date | null;
  dispatchClaimedAt: Date | null;
  dispatchAttempts: number;
  sentAt: Date | null;
  deliveredAt: Date | null;
  failedAt: Date | null;
  readAt: Date | null;
}
