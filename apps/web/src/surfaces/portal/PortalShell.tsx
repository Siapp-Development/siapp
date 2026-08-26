import { Outlet, useParams } from 'react-router';

import { SkipLink } from '@/components/SkipLink.tsx';
import { useSurfaceTheme } from '@/hooks/useSurfaceTheme.ts';

import {
  PortalErrorState,
  PortalInvalidState,
  PortalLoadingState,
  PortalNotStartedState,
} from './PortalErrorStates.tsx';
import { PortalFooter } from './PortalFooter.tsx';
import { PortalSessionProvider, usePortalSession } from './usePortalSession.ts';

/**
 * Client portal shell at siapp.app/p/:token (#21, D8; #126, D-042): redeems
 * the link, renders the firm-branded header, and provides the session to the
 * single-screen dashboard. The old Overview/Documents/Updates tab nav is gone
 * — everything now lives on one screen (the Print button lives in the page
 * header, which has the project data). Mobile-first; the desktop container is
 * widened to max-w-5xl for the multi-section grid.
 */
export function PortalShell() {
  const { token } = useParams<'token'>();
  // Client portal adopts the firm dashboard's cool neutral background
  // (the collaborator surface keeps the warm 'portal' palette).
  useSurfaceTheme('firm');
  const { state, retry } = usePortalSession(token);

  if (state.status === 'loading') {
    return <PortalLoadingState />;
  }
  if (state.status === 'invalid') {
    return <PortalInvalidState />;
  }
  if (state.status === 'not_started') {
    return <PortalNotStartedState firmName={state.firmName} />;
  }
  if (state.status === 'error') {
    return <PortalErrorState onRetry={retry} />;
  }

  const { session } = state;
  const { branding } = session;

  return (
    <div className="flex min-h-dvh flex-col">
      <SkipLink />
      <header className="border-b border-border bg-card px-6 py-6 print:hidden">
        <div className="mx-auto flex max-w-5xl items-center gap-3">
          {branding.logoUrl !== undefined && (
            <img src={branding.logoUrl} alt="" className="h-9 w-9 rounded object-contain" />
          )}
          <div className="min-w-0">
            <p
              className="truncate font-display text-xl font-bold tracking-tight text-foreground"
              style={
                branding.primaryColor !== undefined ? { color: branding.primaryColor } : undefined
              }
            >
              {branding.firmName !== '' ? branding.firmName : 'Client portal'}
            </p>
            <p className="text-xs tracking-wide text-muted-foreground uppercase">Project portal</p>
          </div>
        </div>
      </header>
      <main id="main" className="mx-auto w-full max-w-5xl flex-1 px-6 py-7">
        <PortalSessionProvider value={session}>
          <Outlet />
        </PortalSessionProvider>
      </main>
      <PortalFooter tier={session.tier} firmName={branding.firmName} />
    </div>
  );
}
