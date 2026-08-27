/**
 * Channel provider seam (#18, D9) — the "thin MessageProvider" from
 * pm_ux/plans/13-tech-architecture.md. #18 shipped the interface and a no-op
 * stub only. #19 (#133) wires the real `TwilioProvider` (see
 * `twilioProvider.ts`) and a scheduled dispatcher (`scheduled/dispatchQueue.ts`)
 * that consumes `messages` docs where
 * `status == 'queued' && suppressed != true && (holdUntil absent || <= now)`.
 */

import type { TNotificationTrigger } from './contentSids.js';

/** Queue record fields a provider needs to perform one send. */
export interface IQueuedMessage {
  id: string;
  channel: 'whatsapp' | 'sms';
  recipientPhone: string;
  templateName: string;
  variables: Record<string, string>;
  /**
   * O-1: the provider resolves a Twilio ContentSid by `trigger` (not by the
   * `templateName` string). Written by the enqueue pipeline
   * (`lib/enqueueNotifications.ts` / `triggers/messageUsage.ts`).
   */
  trigger: TNotificationTrigger;
  /** Template locale; MVP is `en` (D-026 defers `ms`). Defaults to `en`. */
  locale?: string;
}

export interface ISendResult {
  ok: boolean;
  /** Provider message id (Twilio SID) on success. */
  providerSid?: string;
  errorCode?: string;
}

export interface IMessageProvider {
  send(msg: IQueuedMessage): Promise<ISendResult>;
}

/** Stub provider — records nothing, sends nothing, always "succeeds". */
export class NoopProvider implements IMessageProvider {
  send(_msg: IQueuedMessage): Promise<ISendResult> {
    return Promise.resolve({ ok: true });
  }
}
