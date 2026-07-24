import { NavLink, Outlet, useParams } from 'react-router';

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

const NAV_ITEMS = [
  { to: '.', end: true, label: 'Overview' },
  { to: 'documents', end: false, label: 'Documents' },
  { to: 'updates', end: false, label: 'Updates' },
] as const;

/**
 * Client portal shell at siapp.app/p/:token (#21, D8): redeems the link,
 * renders the firm-branded header + sub-route nav (Overview / Documents /
 * Updates), and provides the session to the child pages. Mobile-first —
 * clients open these links from WhatsApp.
 */
export function PortalShell() {
  const { token } = useParams<'token'>();
  useSurfaceTheme('portal');
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
      <header className="border-b border-border bg-card px-6 pt-6">
        <div className="mx-auto flex max-w-lg items-center gap-3">
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
        <nav aria-label="Portal sections" className="mx-auto mt-4 max-w-lg">
          <ul className="flex gap-1">
            {NAV_ITEMS.map((item) => (
              <li key={item.label}>
                <NavLink
                  to={item.to}
                  end={item.end}
                  className={({ isActive }) =>
                    `inline-flex min-h-11 items-center border-b-2 px-3 pt-1 text-sm font-medium transition-colors duration-150 ${
                      isActive
                        ? 'border-accent text-foreground'
                        : 'border-transparent text-muted-foreground hover:border-border hover:text-foreground'
                    }`
                  }
                >
                  {item.label}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>
      </header>
      <main id="main" className="mx-auto w-full max-w-lg flex-1 px-6 py-7">
        <PortalSessionProvider value={session}>
          <Outlet />
        </PortalSessionProvider>
      </main>
      <PortalFooter tier={session.tier} firmName={branding.firmName} />
    </div>
  );
}
