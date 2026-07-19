/**
 * Invite email delivery via the Postmark HTTP API (D-040). Deliberately
 * degradable: when POSTMARK_SERVER_TOKEN is not configured (local emulator,
 * or SMTP infra not provisioned yet) the invite still succeeds — the callable
 * returns the invite URL for manual sharing and we log instead of sending.
 */

import { logger } from 'firebase-functions';

const POSTMARK_ENDPOINT = 'https://api.postmarkapp.com/email';

export interface IInviteEmail {
  to: string;
  workspaceName: string;
  inviterName: string;
  role: string;
  inviteUrl: string;
}

export function isMailConfigured(): boolean {
  return Boolean(process.env.POSTMARK_SERVER_TOKEN);
}

/** Returns true when the email was handed to Postmark. */
export async function sendInviteEmail(email: IInviteEmail): Promise<boolean> {
  const token = process.env.POSTMARK_SERVER_TOKEN;
  if (!token) {
    logger.info(
      `sendInviteEmail: POSTMARK_SERVER_TOKEN not configured — skipping email to ${email.to} ` +
        '(invite URL returned to the inviter instead)',
    );
    return false;
  }

  const from = process.env.INVITE_EMAIL_FROM ?? 'no-reply@siapp.app';
  const response = await fetch(POSTMARK_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'X-Postmark-Server-Token': token,
    },
    body: JSON.stringify({
      From: from,
      To: email.to,
      Subject: `You've been invited to ${email.workspaceName} on Siapp`,
      TextBody:
        `${email.inviterName} invited you to join ${email.workspaceName} on Siapp ` +
        `as ${email.role}.\n\nAccept the invite (link expires in 7 days):\n${email.inviteUrl}\n\n` +
        'If you were not expecting this, you can ignore this email.',
      MessageStream: 'outbound',
    }),
  });

  if (!response.ok) {
    logger.error(
      `sendInviteEmail: Postmark responded ${response.status} for ${email.to}`,
      await response.text(),
    );
    return false;
  }
  return true;
}
