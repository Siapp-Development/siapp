import { Link } from 'react-router';

import { LegalPageLayout } from './LegalPageLayout.tsx';
import { LEGAL_PATHS } from './legalRoutes.ts';

/**
 * SMS / Messaging Program Terms at /legal/sms-terms (issue #100), referenced
 * during Twilio A2P registration. Transcribed verbatim from
 * plans/legal/sms-messaging-terms.md. Preserves the carrier-mandated
 * disclosures word for word: message-frequency (§3), message-and-data-rates
 * (§4), STOP/HELP opt-out (§5–§6), and the non-sharing statement (§8).
 */
export function SmsTermsPage() {
  return (
    <LegalPageLayout
      title="Siapp SMS / Messaging Program Terms & Conditions"
      effective="22 August 2026"
      updated="22 August 2026"
    >
      <p>
        These SMS / Messaging Program Terms (&ldquo;<strong>Messaging Terms</strong>&rdquo;) govern
        the SMS and WhatsApp messages sent from Siapp&rsquo;s phone number(s) by{' '}
        <strong>Siapp</strong> (&ldquo;<strong>Siapp</strong>&rdquo;) on behalf of the firms
        that use the Siapp platform. By opting in, you agree to these Messaging Terms. They supplement
        our <Link to={LEGAL_PATHS.terms}>Terms &amp; Conditions</Link>,{' '}
        <Link to={LEGAL_PATHS.privacy}>Privacy Policy</Link>, and{' '}
        <Link to={LEGAL_PATHS.campaignPrivacy}>Campaign Privacy Policy</Link>.
      </p>

      <h2>1. Program description</h2>
      <p>
        Siapp sends <strong>outbound, transactional project notifications</strong> — such as project
        welcome messages, task assignments, status updates, and due-date reminders — to clients and
        collaborators of firms using the Service. This program does <strong>not</strong> send
        marketing or promotional messages.
      </p>

      <h2>2. Consent to receive messages</h2>
      <p>
        By providing your mobile number to a firm and opting in, you consent to receive automated SMS
        and/or WhatsApp messages from Siapp relating to your project.{' '}
        <strong>Consent is not a condition of any purchase.</strong> The firm captures and records
        your opt-in.
      </p>

      <h2>3. Message frequency</h2>
      <p>
        Message frequency <strong>varies</strong> based on activity on your project. You may receive
        from a few messages per week to occasional messages.
      </p>

      <h2>4. Message and data rates</h2>
      <p>
        <strong>Message and data rates may apply.</strong> Rates are charged by your mobile carrier
        under your plan; Siapp does not charge you for these messages. Contact your carrier for
        details about your plan.
      </p>

      <h2>5. Opt-out (STOP)</h2>
      <p>
        You can cancel at any time by replying <strong>STOP</strong> to any message. After you send{' '}
        <strong>STOP</strong>, we will send a one-time confirmation and you will receive no further
        messages, unless you opt in again. You may also unsubscribe by contacting support@siapp.app.
      </p>

      <h2>6. Help (HELP)</h2>
      <p>
        For help, reply <strong>HELP</strong> to any message, email support@siapp.app, or call +1
        (206) 596-7128.
      </p>

      <h2>7. Supported carriers</h2>
      <p>
        Carriers are not liable for delayed or undelivered messages. Message delivery is subject to
        effective transmission by your carrier/operator and is not guaranteed.
      </p>

      <h2>8. Privacy</h2>
      <p>
        Your information is handled per our <Link to={LEGAL_PATHS.privacy}>Privacy Policy</Link> and{' '}
        <Link to={LEGAL_PATHS.campaignPrivacy}>Campaign Privacy Policy</Link>.{' '}
        <strong>
          We do not share or sell mobile numbers or messaging consent to third parties or affiliates
          for marketing or promotional purposes.
        </strong>{' '}
        Numbers are shared only with providers (e.g. Twilio, Meta) as needed to deliver messages you
        opted in to receive.
      </p>

      <h2>9. Changes</h2>
      <p>
        We may update these Messaging Terms; the &ldquo;Last updated&rdquo; date will change.
        Continued participation after changes constitutes acceptance.
      </p>

      <h2>10. Contact</h2>
      <p>
        <strong>Siapp</strong> — support@siapp.app — +1 (206) 596-7128 — Address: Kuala
        Lumpur, Malaysia
      </p>
    </LegalPageLayout>
  );
}
