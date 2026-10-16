/** Monotonic Twilio delivery receipt mapping and callback URL construction. */

import { mapTwilioError } from './twilioError.js';

const STATUS_RANK: Readonly<Record<string, number>> = {
  queued: 1,
  accepted: 1,
  scheduled: 1,
  sending: 1,
  sent: 2,
  delivered: 3,
  undelivered: 3,
  failed: 3,
  read: 4,
};

/** Returns the progress rank of a known provider status, or zero if ignored. */
export function rankOf(status: unknown): number {
  return typeof status === 'string' && Object.hasOwn(STATUS_RANK, status) ? STATUS_RANK[status] : 0;
}

export interface ICurrentDeliveryStatus {
  status?: unknown;
  providerStatus?: unknown;
  providerSid?: unknown;
  sentAt?: unknown;
  deliveredAt?: unknown;
  failedAt?: unknown;
  readAt?: unknown;
  suppressed?: unknown;
}

export interface IDeliveryStatusCallback {
  status: string;
  errorCode?: string;
  messageSid: string;
}

type TDeliveryStatusUpdate = {
  providerStatus?: string;
  statusUpdatedAt?: Date;
  providerSid?: string;
  status?: string;
  sentAt?: Date;
  deliveredAt?: Date;
  failedAt?: Date;
  readAt?: Date;
  errorCode?: string;
};

/**
 * Plans the only fields a signed receipt may advance. A null result means the
 * callback is unknown, duplicate, stale, or blocked by a suppressed record.
 */
export function planStatusUpdate(
  current: ICurrentDeliveryStatus,
  callback: IDeliveryStatusCallback,
  now: Date,
): TDeliveryStatusUpdate | null {
  const incomingRank = rankOf(callback.status);
  const currentRank = rankOf(
    typeof current.providerStatus === 'string' && current.providerStatus.length > 0
      ? current.providerStatus
      : current.status,
  );
  if (current.suppressed === true || incomingRank === 0 || incomingRank <= currentRank) {
    return null;
  }

  const update: TDeliveryStatusUpdate = {
    providerStatus: callback.status,
    statusUpdatedAt: now,
    ...(typeof current.providerSid !== 'string' || current.providerSid.length === 0
      ? { providerSid: callback.messageSid }
      : {}),
  };

  switch (callback.status) {
    case 'sent':
      update['status'] = 'sent';
      if (current.sentAt === undefined || current.sentAt === null) {
        update['sentAt'] = now;
      }
      break;
    case 'delivered':
      update['status'] = 'delivered';
      update['deliveredAt'] = now;
      break;
    case 'read':
      update['status'] = 'read';
      update['readAt'] = now;
      if (current.deliveredAt === undefined || current.deliveredAt === null) {
        update['deliveredAt'] = now;
      }
      break;
    case 'undelivered':
    case 'failed': {
      update['status'] = 'failed';
      update['failedAt'] = now;
      const code = callback.errorCode;
      update['errorCode'] =
        code !== undefined && /^\d+$/.test(code)
          ? mapTwilioError({ code: Number(code) })
          : `twilio_${callback.status}`;
      break;
    }
    default:
      return null;
  }
  return update;
}

/** Builds the per-message URL Twilio signs, or omits callbacks when unconfigured. */
export function buildStatusCallbackUrl(base: string, wid: string, mid: string): string | undefined {
  const normalizedBase = base.trim();
  if (normalizedBase.length === 0) {
    return undefined;
  }
  const query = new URLSearchParams({ wid, mid });
  return `${normalizedBase}?${query.toString()}`;
}
