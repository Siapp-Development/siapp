import { Link } from 'react-router';

import { LegalPageLayout } from './LegalPageLayout.tsx';
import { LEGAL_PATHS } from './legalRoutes.ts';

/**
 * Campaign Privacy Policy at /legal/campaign-privacy (issue #100), referenced
 * during Twilio A2P registration. Transcribed verbatim from
 * plans/legal/campaign-privacy-policy.md. Preserves the four carrier-mandated
 * disclosures word for word: non-sharing (§3), message-frequency (§4),
 * message-and-data-rates (§5), and STOP/HELP opt-out (§6).
 */
export function CampaignPrivacyPage() {
  return (
    <LegalPageLayout
      title="Siapp Messaging Campaign Privacy Policy"
      effective="22 August 2026"
      updated="22 August 2026"
    >
      <p>
        This Campaign Privacy Policy describes how <strong>Siapp</strong> (&ldquo;
        <strong>Siapp</strong>&rdquo;, &ldquo;<strong>we</strong>&rdquo;) handles information
        collected through its SMS/WhatsApp messaging program sent from its Twilio-provisioned phone
        number(s), on behalf of the construction and legal firms that use Siapp. It supplements our
        full <Link to={LEGAL_PATHS.privacy}>Privacy Policy</Link>.
      </p>

      <h2>1. What the program does</h2>
      <p>
        Siapp sends <strong>outbound, transactional project notifications</strong> (for example:
        project welcome, task assignments, status changes, and due-date reminders) to clients and
        collaborators of firms that use the Service. Messages are triggered by project events; we do
        not send marketing or promotional messages through this program.
      </p>

      <h2>2. Consent and opt-in</h2>
      <ul>
        <li>
          Recipients are added by the firm managing their project. The firm captures and records{' '}
          <strong>opt-in consent</strong> (timestamp, source, language, and consent copy) before any
          message is sent.
        </li>
        <li>
          Only recipients who have opted in receive messages; non-consented recipients are
          suppressed.
        </li>
      </ul>

      <h2>3. Mobile information — non-sharing statement</h2>
      <p>
        <strong>
          We do not share, sell, rent, or otherwise disclose mobile phone numbers, opt-in consent, or
          SMS/messaging consent to any third party or affiliate for their own marketing or
          promotional purposes.
        </strong>{' '}
        Mobile numbers and message content are shared only with the service providers strictly
        necessary to deliver the messages you have opted in to receive:
      </p>
      <ul>
        <li>
          <strong>Twilio</strong> — telecommunications provider that transmits SMS/WhatsApp messages;
        </li>
        <li>
          <strong>Meta (WhatsApp Business Platform)</strong> — for WhatsApp delivery.
        </li>
      </ul>
      <p>
        <strong>
          No mobile information is shared with third parties or affiliates for marketing or
          promotional purposes.
        </strong>
      </p>

      <h2>4. Message frequency</h2>
      <p>
        Messages are event-driven and <strong>frequency varies</strong> with the activity on your
        project. You may receive anywhere from a few messages per week to occasional messages,
        depending on how active your project is.
      </p>

      <h2>5. Message and data rates</h2>
      <p>
        <strong>Message and data rates may apply</strong>, depending on your mobile carrier and plan.
        Siapp does not charge recipients for messages.
      </p>

      <h2>6. Opt-out and help</h2>
      <ul>
        <li>
          Reply <strong>STOP</strong> to any message to unsubscribe. After you send STOP, you will
          receive a confirmation and no further messages, unless you opt in again.
        </li>
        <li>
          Reply <strong>HELP</strong> for assistance, or contact us at support@siapp.app / +1 (206)
          596-7128.
        </li>
        <li>We process opt-outs across all senders and honor them going forward.</li>
      </ul>
      <p>
        Full program terms are in our{' '}
        <Link to={LEGAL_PATHS.smsTerms}>SMS / Messaging Terms</Link>.
      </p>

      <h2>7. Data we collect in this program</h2>
      <p>
        Mobile number, message content, delivery and read receipts, opt-in and opt-out records, and
        related timestamps — used solely to deliver and manage the messaging program.
      </p>

      <h2>8. Retention</h2>
      <p>
        We retain messaging records and opt-out records only as long as needed to operate the
        program, honor opt-outs, and meet legal obligations.
      </p>

      <h2>9. Your rights (PDPA)</h2>
      <p>
        If you are a client/collaborator, direct access, correction, or deletion requests to the{' '}
        <strong>firm</strong> managing your project (the data controller). For data Siapp controls
        directly, contact support@siapp.app.
      </p>

      <h2>10. Contact</h2>
      <p>
        <strong>Siapp</strong> — support@siapp.app — +1 (206) 596-7128 — Address: Kuala
        Lumpur, Malaysia
      </p>
    </LegalPageLayout>
  );
}
