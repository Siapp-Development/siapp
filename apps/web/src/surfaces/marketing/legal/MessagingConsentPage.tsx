import { Link } from 'react-router';

import { LegalPageLayout } from './LegalPageLayout.tsx';
import { LEGAL_PATHS } from './legalRoutes.ts';

/**
 * Messaging Consent & Opt-In (Call to Action) page at /legal/messaging-consent
 * (issue #107). Added to resolve a Twilio A2P rejection that cited "issues
 * verifying the Call to Action (CTA)". Transcribed verbatim from
 * plans/legal/messaging-consent.md and mirrors the issue #100 legal-page
 * pattern. The opt-in disclosure is rendered as a bordered callout so a
 * carrier reviewer can clearly perceive the exact consent copy. It also renders
 * a visible, illustrative "Sample opt-in consent form" (issue #109) — with an
 * unchecked-by-default consent checkbox — so a Twilio A2P reviewer can see the
 * actual consent experience (resolving error 30909; guarding 30924/30925).
 * Preserves the four carrier-mandated phrases word for word: the non-sharing statement,
 * "message frequency varies", "Message and data rates may apply", and the
 * STOP/HELP opt-out instructions.
 */
export function MessagingConsentPage() {
  return (
    <LegalPageLayout
      title="Siapp Messaging Consent & Opt-In"
      effective="23 August 2026"
      updated="23 August 2026"
    >
      <p>
        This page explains how end-users consent to receive SMS and WhatsApp messages through Siapp,
        and shows the exact opt-in disclosure (Call to Action) presented to them. It exists so that
        recipients, firms, and messaging carriers can verify how consent is obtained. It supplements
        our <Link to={LEGAL_PATHS.privacy}>Privacy Policy</Link>,{' '}
        <Link to={LEGAL_PATHS.smsTerms}>SMS / Messaging Terms</Link>, and{' '}
        <Link to={LEGAL_PATHS.campaignPrivacy}>Campaign Privacy Policy</Link>.
      </p>

      <h2>Who receives messages</h2>
      <p>
        Siapp is a project-tracking platform used by construction and legal firms in Malaysia. The
        firms use Siapp to send <strong>project-status updates</strong> to{' '}
        <strong>their own clients and collaborators</strong> — the people already engaged on a
        project with that firm. Siapp does not message the general public and does not sell or share
        mobile numbers.
      </p>

      <h2>What messages you will receive</h2>
      <p>
        Messages are <strong>transactional project notifications</strong> only — for example: a
        project welcome, task assignments, status changes, and due-date reminders. We do not send
        marketing or promotional messages.
      </p>

      <h2>How you opt in (Call to Action)</h2>
      <p>
        Your consent is collected by the firm <strong>before any message is sent</strong>, through
        one of two paths:
      </p>
      <ol>
        <li>
          <strong>Written intake / engagement form.</strong> When you engage the firm, you provide
          your mobile number and check a consent box — <strong>unchecked by default</strong> — on
          the firm&rsquo;s client intake or engagement form, agreeing to receive recurring
          project-update messages from the firm via Siapp.
        </li>
        <li>
          <strong>Verbal agreement during onboarding.</strong> You confirm your agreement verbally,
          and the firm records your opt-in in Siapp with a timestamp, source, and language.
        </li>
      </ol>
      <p>
        Consent is <strong>not</strong> a condition of any purchase. At the point of opt-in you are
        shown the following disclosure:
      </p>
      <blockquote className="legal-callout" aria-label="Opt-in disclosure shown at the point of consent">
        <p>
          <strong>
            ☐ I agree to receive project update messages from [Firm Name] via Siapp by SMS and/or
            WhatsApp.
          </strong>{' '}
          Message frequency varies. Message and data rates may apply. Reply STOP to unsubscribe,
          HELP for help. See the <Link to={LEGAL_PATHS.privacy}>Privacy Policy</Link> and{' '}
          <Link to={LEGAL_PATHS.smsTerms}>SMS / Messaging Terms</Link>.
        </p>
      </blockquote>
      <p>
        The first message you receive is a branded welcome confirming your enrollment and repeating
        the STOP/HELP instructions.
      </p>

      <h2>Sample opt-in consent form</h2>
      <p>
        The following is a representative sample of the opt-in consent experience an end-user sees on
        the firm&rsquo;s intake/engagement form. The consent checkbox is{' '}
        <strong>unchecked by default</strong> and requires the end-user&rsquo;s active agreement.
      </p>
      <form
        className="legal-sample-form"
        aria-label="Sample opt-in consent form"
        onSubmit={(e) => e.preventDefault()}
      >
        <fieldset>
          <legend>Sample: Project update messages</legend>
          <p className="legal-sample-note">
            Representative sample only — this form is illustrative and does not submit.
          </p>
          <div className="legal-sample-field">
            <label htmlFor="sample-mobile-number">Mobile number</label>
            <input
              id="sample-mobile-number"
              type="tel"
              placeholder="+60 ..."
              disabled
            />
          </div>
          <div className="legal-sample-field">
            <input id="sample-consent" type="checkbox" disabled />
            <label htmlFor="sample-consent">
              I agree to receive recurring project-update text messages (SMS/WhatsApp) from [Firm
              Name] via Siapp.
            </label>
          </div>
          <p className="legal-sample-disclosure">
            Message frequency varies. Message and data rates may apply. Reply STOP to unsubscribe,
            HELP for help. See the <Link to={LEGAL_PATHS.smsTerms}>Terms &amp; Conditions</Link> and{' '}
            <Link to={LEGAL_PATHS.privacy}>Privacy Policy</Link>.
          </p>
          <button type="submit" disabled>
            Submit
          </button>
        </fieldset>
      </form>

      <h2>Message frequency</h2>
      <p>
        <strong>Message frequency varies</strong> based on activity on your project — from a few
        messages per week to occasional messages.
      </p>

      <h2>Message and data rates</h2>
      <p>
        <strong>Message and data rates may apply</strong>, depending on your mobile carrier and
        plan. Siapp does not charge recipients for messages.
      </p>

      <h2>Opt-out and help</h2>
      <ul>
        <li>
          Reply <strong>STOP</strong> at any time to unsubscribe. You will receive a confirmation
          and no further messages unless you opt in again.
        </li>
        <li>
          Reply <strong>HELP</strong> for assistance, or contact support@siapp.app / +1 (206)
          596-7128.
        </li>
        <li>We process opt-outs across all senders and honor them going forward.</li>
      </ul>

      <h2>Example messages</h2>
      <ul>
        <li>
          <strong>Welcome:</strong> &ldquo;Hello [Client First Name], [Firm Name] here via Siapp.
          Your project &lsquo;[Project Name]&rsquo; is now being tracked. View progress anytime:
          https://siapp.app/p/[code]. Msg frequency varies. Msg &amp; data rates may apply. Reply
          STOP to opt out, HELP for help.&rdquo;
        </li>
        <li>
          <strong>Status update:</strong> &ldquo;Update from [Firm Name] via Siapp on
          &lsquo;[Project Name]&rsquo;: &lsquo;[Task Name]&rsquo; is now [Status]. View your tracker:
          https://siapp.app/p/[code]. Reply STOP to opt out.&rdquo;
        </li>
      </ul>

      <h2>Privacy</h2>
      <p>
        <strong>
          We do not share, sell, or rent mobile numbers or messaging consent to third parties or
          affiliates for their own marketing or promotional purposes.
        </strong>{' '}
        Mobile numbers are shared only with the providers needed to deliver messages you opted in to
        receive (e.g. Twilio, Meta). See our <Link to={LEGAL_PATHS.privacy}>Privacy Policy</Link>.
      </p>

      <h2>Contact</h2>
      <p>
        <strong>Siapp</strong> — support@siapp.app — +1 (206) 596-7128 — Kuala Lumpur, Malaysia
      </p>
    </LegalPageLayout>
  );
}
