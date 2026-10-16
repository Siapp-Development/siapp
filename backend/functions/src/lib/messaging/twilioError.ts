/** Stable application error names for Twilio Messaging API and receipts. */

const TWILIO_ERROR_CODES: Readonly<Record<number, string>> = {
  21211: 'invalid_to_number',
  63003: 'wa_channel_not_available',
  63015: 'wa_channel_not_found',
  63016: 'wa_outside_session_window',
  63018: 'wa_rate_limited',
  63021: 'wa_message_undeliverable',
};

/** Maps a Twilio error code to a stable string; unknown numeric codes remain visible. */
export function mapTwilioError(error: unknown): string {
  const code = (error as { code?: unknown } | null)?.code;
  if (typeof code === 'number') {
    return TWILIO_ERROR_CODES[code] ?? `twilio_${code}`;
  }
  return 'twilio_error';
}
