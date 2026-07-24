/**
 * Static bilingual PDPA notice for external surfaces (#26 D5). Rendered in
 * the client portal and collaborator task page footers — the firm is the
 * data controller, so all data-subject requests route to the firm, not
 * Siapp. Lives in src/components/ because both isolated bundles use it
 * (D-036: no firm-app imports here).
 */

export interface IPrivacyNoticeProps {
  /** Firm display name; callers supply their own fallback. */
  firmName: string;
}

export function PrivacyNotice({ firmName }: IPrivacyNoticeProps) {
  return (
    <p className="text-xs text-muted-foreground">
      <span lang="en">
        {firmName} shares project updates with you via Siapp. Contact {firmName} to access,
        correct or delete your personal data.
      </span>{' '}
      <span lang="ms">
        {firmName} berkongsi kemas kini projek dengan anda melalui Siapp. Hubungi {firmName} untuk
        akses, pembetulan atau pemadaman data peribadi anda.
      </span>
    </p>
  );
}
