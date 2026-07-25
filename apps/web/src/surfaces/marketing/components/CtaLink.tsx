import { buttonVariants, cn } from '@siapp/ui';

import { track } from '../lib/track.ts';

export interface ICtaLinkProps {
  /** Where on the page this CTA lives — reported with the analytics event. */
  location: 'nav' | 'hero' | 'final' | 'mobile-menu';
  size?: 'md' | 'lg';
  className?: string;
  children?: React.ReactNode;
}

const FORM_URL = import.meta.env.VITE_EARLY_ACCESS_FORM_URL;

/**
 * Primary "Request early access" CTA (impl-28 §1.2). Lead capture is fully
 * external: this is a plain link to the Typeform, opened in a new tab. The
 * URL is baked in from VITE_EARLY_ACCESS_FORM_URL (build fails without it).
 */
export function CtaLink({ location, size = 'md', className, children }: ICtaLinkProps) {
  return (
    <a
      href={FORM_URL}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(buttonVariants({ variant: 'primary', size }), className)}
      onClick={() => {
        track('early_access_cta_clicked', { location });
      }}
    >
      {children ?? 'Request early access'}
      <span className="sr-only"> (opens in a new tab)</span>
    </a>
  );
}
