/** Twilio SDK-backed request signature validation for form webhooks. */

import twilio from 'twilio';

export interface ITwilioSignatureInput {
  authToken: string;
  signature: string | undefined;
  url: string;
  params: Record<string, unknown>;
}

/** Fails closed for missing credentials/header and delegates verification to Twilio. */
export function verifyTwilioSignature(input: ITwilioSignatureInput): boolean {
  if (input.authToken.trim().length === 0 || !input.signature) {
    return false;
  }
  try {
    return twilio.validateRequest(input.authToken, input.signature, input.url, input.params);
  } catch {
    return false;
  }
}
