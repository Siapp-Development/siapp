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
      <header className="border-b border-border bg-card px-6 py-4">
        <div className="mx-auto flex max-w-lg items-center gap-3">
          {branding.logoUrl !== undefined && (
            <img src={branding.logoUrl} alt="" className="h-8 w-8 rounded object-contain" />
          )}
          <p
            className="text-lg font-semibold text-primary"
            style={
              branding.primaryColor !== undefined ? { color: branding.primaryColor } : undefined
            }
          >
            {branding.firmName !== '' ? branding.firmName : 'Client portal'}
          </p>
        </div>
        <nav aria-label="Portal sections" className="mx-auto mt-3 max-w-lg">
          <ul className="flex gap-1">
            {NAV_ITEMS.map((item) => (
              <li key={item.label}>
                <NavLink
                  to={item.to}
                  end={item.end}
                  className={({ isActive }) =>
                    `rounded-md px-3 py-1.5 text-sm font-medium ${
                      isActive
                        ? 'bg-primary text-primary-foreground'
                        : 'text-muted-foreground hover:bg-muted hover:text-foreground'
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
      <main id="main" className="mx-auto w-full max-w-lg flex-1 px-6 py-6">
        <PortalSessionProvider value={session}>
          <Outlet />
        </PortalSessionProvider>
      </main>
      <PortalFooter tier={session.tier} firmName={branding.firmName} />
    </div>
  );
}
