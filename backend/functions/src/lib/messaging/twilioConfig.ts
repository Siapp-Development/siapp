/**
 * Twilio credential + sender config for outbound WhatsApp (#133).
 *
 * Account SID and auth token are SECRETS (`defineSecret`, Secret Manager) —
 * NEVER committed. The dispatcher (`onMessageDispatchSweep`) binds both so the
 * runtime injects them into `process.env` (mirrors `postmarkServerToken` in
 * `lib/mail.ts`). The WhatsApp sender number is a non-secret `defineString`
 * committed to `.env.siapp-prod` (same pattern as `PORTAL_ORIGIN`).
 */

import { defineSecret, defineString } from 'firebase-functions/params';

// Bind these in the `secrets: [...]` array of any function that sends.
export const twilioAccountSid = defineSecret('TWILIO_ACCOUNT_SID');
export const twilioAuthToken = defineSecret('TWILIO_AUTH_TOKEN');

/**
 * The shared Siapp WhatsApp sender (D-001). Committed default matches the
 * approved sender in the templates doc; override per-project via
 * `.env.siapp-prod`. Stored WITHOUT the `whatsapp:` channel prefix — the
 * provider prepends it.
 */
export const waSender = defineString('WA_SENDER', { default: '+13604414161' });

export interface ITwilioCredentials {
  accountSid: string;
  authToken: string;
  sender: string;
}

/** True when both Twilio secrets are present in the environment. */
export function hasTwilioCredentials(): boolean {
  return Boolean(process.env.TWILIO_ACCOUNT_SID) && Boolean(process.env.TWILIO_AUTH_TOKEN);
}

/**
 * Reads Twilio credentials from the environment at invocation time. Returns
 * `null` when either secret is absent (local/emulator/CI) so callers can fall
 * back to the `NoopProvider`.
 */
export function readTwilioCredentials(): ITwilioCredentials | null {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  if (!accountSid || !authToken) {
    return null;
  }
  return { accountSid, authToken, sender: waSender.value() };
}
