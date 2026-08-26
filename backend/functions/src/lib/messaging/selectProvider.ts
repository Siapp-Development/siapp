/**
 * Provider selection factory (#133). Returns a `NoopProvider` under the
 * emulator or when Twilio credentials are absent (local/CI), otherwise a
 * configured `TwilioProvider`. Mirrors the `isMailConfigured()` degradability
 * in `lib/mail.ts` — guarantees tests/emulator runs never hit the network.
 *
 * The dispatcher calls `selectProvider()` once per sweep invocation and passes
 * the instance to `sweepMessageQueue`.
 */

import { logger } from 'firebase-functions';

import { readTwilioCredentials } from './twilioConfig.js';
import { resolveContentSid } from './contentSids.js';
import { createTwilioClient, TwilioProvider } from './twilioProvider.js';
import { NoopProvider, type IMessageProvider } from './provider.js';

/** True when running under the Firebase emulator suite. */
export function isEmulator(): boolean {
  return process.env.FUNCTIONS_EMULATOR === 'true';
}

/**
 * Selects the outbound message provider for this environment. Falls back to
 * `NoopProvider` when in the emulator or when Twilio credentials are missing.
 */
export function selectProvider(): IMessageProvider {
  if (isEmulator()) {
    return new NoopProvider();
  }
  const credentials = readTwilioCredentials();
  if (credentials === null) {
    logger.info('selectProvider: Twilio credentials absent — using NoopProvider (no sends)');
    return new NoopProvider();
  }
  return new TwilioProvider({
    client: createTwilioClient(credentials.accountSid, credentials.authToken),
    sender: credentials.sender,
    resolveContentSid,
  });
}
