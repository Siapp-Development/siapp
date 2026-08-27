/**
 * Real Twilio-backed `IMessageProvider` (#133) — sends one WhatsApp message
 * via the Twilio Content Templates API (`client.messages.create` with
 * `contentSid` + `contentVariables`). Credential-gated: `selectProvider.ts`
 * only instantiates this when Twilio creds are present and we are not in the
 * emulator, so builds/tests/emulator runs never hit the network.
 *
 * Never rethrows: a bad recipient or Twilio error maps to
 * `{ ok: false, errorCode }` so one failure cannot abort the dispatcher sweep.
 * Uses `firebase-functions` `logger` (eslint `no-console: error`).
 */

import twilio from 'twilio';
import { logger } from 'firebase-functions';

import type { IMessageProvider, IQueuedMessage, ISendResult } from './provider.js';
import type { TNotificationTrigger } from './contentSids.js';

const WHATSAPP_PREFIX = 'whatsapp:';
/** Em-dash placeholder for empty declared variables (Twilio rejects blanks). */
const EMPTY_VAR_PLACEHOLDER = '—';

/** Known Twilio error codes → stable, human-scannable `errorCode` strings. */
const TWILIO_ERROR_CODES: Record<number, string> = {
  21211: 'invalid_to_number',
  63003: 'wa_channel_not_available',
  63015: 'wa_channel_not_found',
  63016: 'wa_outside_session_window',
  63018: 'wa_rate_limited',
  63021: 'wa_message_undeliverable',
};

/** Minimal shape of the Twilio message-create result we consume. */
export interface ITwilioMessageResult {
  sid: string;
}

/** Options passed to `client.messages.create` for a Content Template send. */
export interface ITwilioCreateOptions {
  from: string;
  to: string;
  contentSid: string;
  contentVariables: string;
}

/**
 * Narrow, injectable surface of the Twilio client (only what the provider
 * calls) — keeps `TwilioProvider` unit-testable without the real SDK.
 */
export interface ITwilioClient {
  messages: {
    create(opts: ITwilioCreateOptions): Promise<ITwilioMessageResult>;
  };
}

/** Resolver closure: `trigger` (+ locale) → Content SID, or `null` if none. */
export type TResolveContentSid = (trigger: TNotificationTrigger, locale?: string) => string | null;

export interface ITwilioProviderDeps {
  client: ITwilioClient;
  /** Sender number WITHOUT the `whatsapp:` prefix (e.g. `+13604414161`). */
  sender: string;
  resolveContentSid: TResolveContentSid;
}

/** Builds a real Twilio client from credentials (production factory). */
export function createTwilioClient(accountSid: string, authToken: string): ITwilioClient {
  return twilio(accountSid, authToken) as unknown as ITwilioClient;
}

/**
 * Maps a caught Twilio error to a stable `errorCode` string. Falls back to
 * `twilio_<code>` for unmapped numeric codes, else `twilio_error`.
 */
export function mapTwilioError(error: unknown): string {
  const code = (error as { code?: unknown } | null)?.code;
  if (typeof code === 'number') {
    return TWILIO_ERROR_CODES[code] ?? `twilio_${code}`;
  }
  return 'twilio_error';
}

/**
 * Serialises message variables to a Twilio `contentVariables` JSON string,
 * substituting the em-dash placeholder for any empty value (e.g. an absent
 * optional `dueDate`) — Twilio rejects declared variables left blank.
 */
export function buildContentVariables(variables: Record<string, string>): string {
  const filled: Record<string, string> = {};
  for (const [key, value] of Object.entries(variables)) {
    filled[key] = value === '' ? EMPTY_VAR_PLACEHOLDER : value;
  }
  return JSON.stringify(filled);
}

export class TwilioProvider implements IMessageProvider {
  private readonly client: ITwilioClient;
  private readonly sender: string;
  private readonly resolveContentSid: TResolveContentSid;

  constructor(deps: ITwilioProviderDeps) {
    this.client = deps.client;
    this.sender = deps.sender;
    this.resolveContentSid = deps.resolveContentSid;
  }

  async send(msg: IQueuedMessage): Promise<ISendResult> {
    const contentSid = this.resolveContentSid(msg.trigger, msg.locale ?? 'en');
    if (contentSid === null) {
      // O-7: no approved template for this trigger → visible, non-crashing.
      logger.warn('TwilioProvider: no ContentSid for trigger', {
        messageId: msg.id,
        trigger: msg.trigger,
        locale: msg.locale ?? 'en',
      });
      return { ok: false, errorCode: 'no_content_sid' };
    }

    try {
      const result = await this.client.messages.create({
        from: `${WHATSAPP_PREFIX}${this.sender}`,
        to: `${WHATSAPP_PREFIX}${msg.recipientPhone}`,
        contentSid,
        contentVariables: buildContentVariables(msg.variables),
      });
      return { ok: true, providerSid: result.sid };
    } catch (error) {
      const errorCode = mapTwilioError(error);
      logger.error('TwilioProvider: send failed', {
        messageId: msg.id,
        trigger: msg.trigger,
        errorCode,
      });
      return { ok: false, errorCode };
    }
  }
}
