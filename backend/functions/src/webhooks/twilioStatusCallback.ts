/** Signed, outbound-only Twilio message status receipt endpoint (#171, #20 receipts only). */

import type { Firestore } from 'firebase-admin/firestore';
import type { Request } from 'firebase-functions/v2/https';

import { errorPayload } from '../lib/errors.js';
import { planStatusUpdate, type IDeliveryStatusCallback } from '../lib/messaging/deliveryStatus.js';
import { verifyTwilioSignature } from '../lib/messaging/twilioSignature.js';

interface IHttpResponse {
  status(code: number): IHttpResponse;
  send(body?: string): unknown;
}

interface IStatusLogger {
  warn(message: string, context?: Record<string, unknown>): void;
  error(message: string, context?: Record<string, unknown>): void;
}

export interface ITwilioStatusHandlerDeps {
  db: Firestore;
  authToken: () => string;
  accountSid: () => string;
  callbackUrl: () => string;
  logger: IStatusLogger;
  verifySignature?: typeof verifyTwilioSignature;
  now?: () => Date;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function singleQueryValue(query: URLSearchParams, key: string): string | null {
  const values = query.getAll(key);
  return values.length === 1 ? (values[0] ?? null) : null;
}

function isDocumentId(value: string): boolean {
  return (
    value.length > 0 &&
    value.length <= 1500 &&
    !value.includes('/') &&
    !Array.from(value).some((char) => {
      const code = char.charCodeAt(0);
      return code <= 0x1f || code === 0x7f;
    })
  );
}

function parseCallback(params: Record<string, unknown>): IDeliveryStatusCallback | null {
  const messageSid = params['MessageSid'];
  const status = params['MessageStatus'];
  const errorCode = params['ErrorCode'];
  if (!nonEmptyString(messageSid) || !nonEmptyString(status)) {
    return null;
  }
  if (
    errorCode !== undefined &&
    errorCode !== '' &&
    (typeof errorCode !== 'string' || !/^\d+$/.test(errorCode))
  ) {
    return null;
  }
  return {
    messageSid,
    status,
    ...(typeof errorCode === 'string' && errorCode.length > 0 ? { errorCode } : {}),
  };
}

/** Creates an injectable handler; only verified requests can reach Firestore. */
export function createTwilioStatusHandler(
  deps: ITwilioStatusHandlerDeps,
): (request: Request, response: IHttpResponse) => Promise<void> {
  const verifySignature = deps.verifySignature ?? verifyTwilioSignature;
  return async (request: Request, response: IHttpResponse): Promise<void> => {
    if (request.method !== 'POST') {
      response.status(405).send('');
      return;
    }

    const callbackBase = deps.callbackUrl().trim();
    const authToken = deps.authToken().trim();
    const accountSid = deps.accountSid().trim();
    const signature = request.get('X-Twilio-Signature');
    if (
      callbackBase.length === 0 ||
      authToken.length === 0 ||
      accountSid.length === 0 ||
      !signature
    ) {
      response.status(403).send('');
      return;
    }

    const params = isRecord(request.body) ? request.body : {};
    const queryStart = request.originalUrl.indexOf('?');
    const rawQuery = queryStart < 0 ? '' : request.originalUrl.slice(queryStart + 1);
    const signedUrl = `${callbackBase}${queryStart < 0 ? '' : `?${rawQuery}`}`;
    if (!verifySignature({ authToken, signature, url: signedUrl, params })) {
      response.status(403).send('');
      return;
    }

    const query = new URLSearchParams(rawQuery);
    const workspaceId = singleQueryValue(query, 'wid');
    const messageId = singleQueryValue(query, 'mid');
    const providerAccountSid = params['AccountSid'];
    const callback = parseCallback(params);
    if (
      workspaceId === null ||
      messageId === null ||
      !isDocumentId(workspaceId) ||
      !isDocumentId(messageId) ||
      !nonEmptyString(providerAccountSid) ||
      callback === null
    ) {
      deps.logger.warn('twilioStatusCallback: signed callback payload is malformed');
      response.status(200).send('');
      return;
    }
    if (providerAccountSid !== accountSid) {
      deps.logger.warn('twilioStatusCallback: account SID mismatch', { workspaceId, messageId });
      response.status(200).send('');
      return;
    }

    const messageRef = deps.db
      .collection('workspaces')
      .doc(workspaceId)
      .collection('messages')
      .doc(messageId);

    try {
      const outcome = await deps.db.runTransaction(async (transaction) => {
        const snapshot = await transaction.get(messageRef);
        if (!snapshot.exists) {
          return 'missing';
        }
        const current = snapshot.data() ?? {};
        if (current['suppressed'] === true) {
          return 'ignored';
        }
        const storedSid = current['providerSid'];
        if (
          typeof storedSid === 'string' &&
          storedSid.length > 0 &&
          storedSid !== callback.messageSid
        ) {
          return 'ignored';
        }
        const update = planStatusUpdate(current, callback, deps.now?.() ?? new Date());
        if (update === null) {
          return 'ignored';
        }
        transaction.update(messageRef, update);
        return 'updated';
      });
      if (outcome === 'missing') {
        deps.logger.warn('twilioStatusCallback: message record not found', {
          workspaceId,
          messageId,
        });
      }
      response.status(200).send('');
    } catch (error) {
      deps.logger.error('twilioStatusCallback: transaction failed', {
        workspaceId,
        messageId,
        err: errorPayload(error),
      });
      response.status(500).send('');
    }
  };
}
