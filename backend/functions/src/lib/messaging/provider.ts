/**
 * Channel provider seam (#18, D9) — the "thin MessageProvider" from
 * pm_ux/plans/13-tech-architecture.md. #18 ships the interface and a no-op
 * stub only; NO caller is wired to Twilio anywhere in this ticket. #19's
 * dispatcher instantiates a real provider and consumes `messages` docs where
 * `status == 'queued' && suppressed != true && (holdUntil absent || <= now)`.
 */

/** Queue record fields a provider needs to perform one send. */
export interface IQueuedMessage {
  id: string;
  channel: 'whatsapp' | 'sms';
  recipientPhone: string;
  templateName: string;
  variables: Record<string, string>;
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
