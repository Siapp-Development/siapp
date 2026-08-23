import { Link } from 'react-router';

import { LegalPageLayout } from './LegalPageLayout.tsx';
import { LEGAL_PATHS } from './legalRoutes.ts';

/**
 * Public Terms & Conditions at /terms (issue #100). Transcribed verbatim from
 * plans/legal/terms-and-conditions.md; sibling .md cross-links are mapped to
 * the in-app legal routes.
 */
export function TermsPage() {
  return (
    <LegalPageLayout
      title="Siapp Terms & Conditions"
      effective="22 August 2026"
      updated="22 August 2026"
    >
      <p>
        These Terms &amp; Conditions (&ldquo;<strong>Terms</strong>&rdquo;) govern your access to and
        use of the Siapp platform and website at <code>siapp.app</code> and{' '}
        <code>dashboard.siapp.app</code> (the &ldquo;<strong>Service</strong>&rdquo;), operated by{' '}
        <strong>Siapp</strong> (&ldquo;<strong>Siapp</strong>&rdquo;, &ldquo;
        <strong>we</strong>&rdquo;, &ldquo;<strong>us</strong>&rdquo;). By creating an account,
        accessing, or using the Service, you agree to these Terms. If you do not agree, do not use
        the Service.
      </p>

      <h2>1. Definitions</h2>
      <ul>
        <li>
          <strong>Firm / Customer</strong> — the organization that subscribes to the Service.
        </li>
        <li>
          <strong>User</strong> — an individual authorized by a Firm to access the Service.
        </li>
        <li>
          <strong>Recipient</strong> — a client or collaborator who receives notifications or
          accesses a portal/task page.
        </li>
        <li>
          <strong>Content</strong> — projects, tasks, notes, documents, messages, and other data
          submitted to or generated in the Service.
        </li>
      </ul>

      <h2>2. Eligibility and accounts</h2>
      <ul>
        <li>You must be at least 18 and able to form a binding contract.</li>
        <li>
          You are responsible for keeping credentials confidential and for all activity under your
          account. Notify us immediately of any unauthorized use.
        </li>
        <li>
          Workspaces are provisioned by Siapp during onboarding; you must provide accurate
          information.
        </li>
      </ul>

      <h2>3. The Service</h2>
      <p>
        Siapp provides project tracking and outbound client/collaborator notifications (WhatsApp and
        SMS) for construction and legal firms. The Service delivers{' '}
        <strong>outbound, opt-in, transactional</strong> messages only. Availability, features, and
        tiers may change; we will give reasonable notice of material adverse changes.
      </p>

      <h2>4. Customer responsibilities and acceptable use</h2>
      <p>
        You agree that you will <strong>not</strong>, and will not permit any User or Recipient to:
      </p>
      <ul>
        <li>Use the Service to send spam, unsolicited, or non-consented messages;</li>
        <li>Send unlawful, deceptive, harassing, or infringing content;</li>
        <li>Message any person who has not opted in, or who has opted out (replied STOP);</li>
        <li>
          Use the Service for any prohibited vertical or in violation of Twilio, Meta, or carrier
          policies;
        </li>
        <li>Attempt to breach security, reverse engineer, scrape, or overload the Service;</li>
        <li>Misrepresent the sender or the purpose of any message.</li>
      </ul>
      <p>
        <strong>You are responsible for obtaining and maintaining valid opt-in consent</strong> from
        every Recipient before enabling notifications, and for honoring opt-outs. Violations may
        result in suspension (including an abuse &ldquo;kill switch&rdquo;) without notice.
      </p>

      <h2>5. Messaging terms</h2>
      <p>
        Use of SMS/WhatsApp notifications is additionally governed by our{' '}
        <Link to={LEGAL_PATHS.smsTerms}>SMS / Messaging Terms</Link> and{' '}
        <Link to={LEGAL_PATHS.campaignPrivacy}>Campaign Privacy Policy</Link>.{' '}
        <strong>Message and data rates may apply.</strong> Message frequency varies with project
        activity. Recipients may reply <strong>STOP</strong> to opt out and <strong>HELP</strong> for
        help.
      </p>

      <h2>6. Fees and billing</h2>
      <ul>
        <li>Fees are charged per the plan tier selected, in MYR.</li>
        <li>Applicable taxes (e.g. SST) are added where required.</li>
        <li>Fees are non-refundable except as required by law or expressly stated.</li>
        <li>We may change pricing on 30 days&rsquo; notice for renewal periods.</li>
      </ul>

      <h2>7. Data ownership and privacy</h2>
      <ul>
        <li>
          <strong>You own your Content.</strong> You grant Siapp a limited license to host, process,
          and transmit Content solely to provide the Service.
        </li>
        <li>
          Siapp processes personal data as described in the{' '}
          <Link to={LEGAL_PATHS.privacy}>Privacy Policy</Link>. For Recipient personal data, the Firm
          is the data controller and Siapp is the processor, subject to a Data Processing Addendum.
        </li>
      </ul>

      <h2>8. Intellectual property</h2>
      <p>
        Siapp and its licensors own all rights in the Service, software, and brand
        (&ldquo;Siapp&rdquo;). These Terms grant no rights to our IP except the limited right to use
        the Service.
      </p>

      <h2>9. Third-party services</h2>
      <p>
        The Service relies on third parties (Twilio, Meta/WhatsApp, hosting, payments). Their terms
        and policies apply to their portions of the Service, and we are not liable for their acts or
        outages beyond our reasonable control.
      </p>

      <h2>10. Suspension and termination</h2>
      <p>
        We may suspend or terminate access for breach of these Terms, non-payment, legal risk, or
        messaging-policy violations. You may cancel per your plan. On termination we will make
        Content available for export for 30 days, then delete or anonymize it.
      </p>

      <h2>11. Disclaimers</h2>
      <p>
        The Service is provided <strong>&ldquo;as is&rdquo;</strong> and{' '}
        <strong>&ldquo;as available.&rdquo;</strong> We do not warrant uninterrupted or error-free
        operation.{' '}
        <strong>
          Siapp does not provide legal, construction, or professional advice; message templates are
          not legal advice.
        </strong>
      </p>

      <h2>12. Limitation of liability</h2>
      <p>
        To the maximum extent permitted by law, Siapp&rsquo;s aggregate liability arising out of or
        related to the Service is limited to the fees paid by the Firm in the 12 months preceding the
        claim. We are not liable for indirect, incidental, or consequential damages, including lost
        profits or data.
      </p>

      <h2>13. Indemnity</h2>
      <p>
        You will indemnify Siapp against claims arising from your Content, your messaging (including
        lack of valid consent), or your violation of these Terms or applicable law.
      </p>

      <h2>14. Governing law and disputes</h2>
      <p>
        These Terms are governed by the laws of <strong>Malaysia</strong>. The courts of Kuala Lumpur
        have exclusive jurisdiction, subject to any agreed arbitration.
      </p>

      <h2>15. Changes to these Terms</h2>
      <p>
        We may update these Terms; material changes will be notified via the Service or email.
        Continued use after the effective date constitutes acceptance.
      </p>

      <h2>16. Contact</h2>
      <p>
        <strong>Siapp</strong> — support@siapp.app — Phone: +1 (206) 596-7128 — Address:
        Kuala Lumpur, Malaysia
      </p>
    </LegalPageLayout>
  );
}
