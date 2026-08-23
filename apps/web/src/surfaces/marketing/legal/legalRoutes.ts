/**
 * Single source of truth for the public legal-page routes (issue #100).
 * Referenced by the apex router, the marketing footer, the shared
 * LegalPageLayout cross-links, and tests so the paths never drift.
 */
export const LEGAL_PATHS = {
  privacy: '/privacy',
  terms: '/terms',
  campaignPrivacy: '/legal/campaign-privacy',
  smsTerms: '/legal/sms-terms',
  messagingConsent: '/legal/messaging-consent',
} as const;

export interface ILegalLink {
  label: string;
  path: string;
}

/** Ordered list used to render the layout footer + any legal-page index. */
export const LEGAL_LINKS: ILegalLink[] = [
  { label: 'Privacy Policy', path: LEGAL_PATHS.privacy },
  { label: 'Terms & Conditions', path: LEGAL_PATHS.terms },
  { label: 'Campaign Privacy Policy', path: LEGAL_PATHS.campaignPrivacy },
  { label: 'SMS / Messaging Terms', path: LEGAL_PATHS.smsTerms },
  { label: 'Messaging Consent & Opt-In', path: LEGAL_PATHS.messagingConsent },
];
