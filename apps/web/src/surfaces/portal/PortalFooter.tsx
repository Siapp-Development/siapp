import type { TWorkspacePlan } from '@siapp/shared';

/**
 * Portal footer (#21, D6 tier rules): trial/standard show "Powered by Siapp";
 * business shows the firm name only (white-label). Unknown tiers fall back to
 * the powered-by badge.
 */
export function PortalFooter({ tier, firmName }: { tier: TWorkspacePlan; firmName: string }) {
  return (
    <footer className="mt-auto border-t border-border px-6 py-4 text-center text-xs text-muted-foreground">
      {tier === 'business' ? (
        <p>{firmName}</p>
      ) : (
        <p>
          Powered by{' '}
          <a
            href="https://siapp.app"
            className="font-medium text-primary underline-offset-2 hover:underline"
          >
            Siapp
          </a>
        </p>
      )}
    </footer>
  );
}
