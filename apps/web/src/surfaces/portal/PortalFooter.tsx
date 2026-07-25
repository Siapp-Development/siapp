import type { TWorkspacePlan } from '@siapp/shared';

import siappLogoFull from '@/assets/siapp-logo-full.png';
import { PrivacyNotice } from '@/components/PrivacyNotice.tsx';

/**
 * Portal footer (#21, D6 tier rules): trial/standard show "Powered by Siapp";
 * business shows the firm name only (white-label). Unknown tiers fall back to
 * the powered-by badge. Always carries the bilingual PDPA notice (#26 D5).
 */
export function PortalFooter({ tier, firmName }: { tier: TWorkspacePlan; firmName: string }) {
  return (
    <footer className="mt-auto flex flex-col gap-2 border-t border-border px-6 py-4 text-center text-xs text-muted-foreground">
      <PrivacyNotice firmName={firmName} />
      {tier === 'business' ? (
        <p>{firmName}</p>
      ) : (
        <p className="flex items-center justify-center gap-1.5">
          Powered by{' '}
          <a
            href="https://siapp.app"
            className="inline-flex items-center transition-opacity duration-150 hover:opacity-80"
          >
            <img src={siappLogoFull} alt="Siapp" className="h-5 w-auto" />
          </a>
        </p>
      )}
    </footer>
  );
}
