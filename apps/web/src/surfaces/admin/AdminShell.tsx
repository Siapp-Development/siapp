import { Button } from '@siapp/ui';
import { NavLink, Outlet } from 'react-router';

import { SkipLink } from '@/components/SkipLink.tsx';
import { useAdminAuth } from './auth/useAdminAuth.ts';

const environment = import.meta.env.MODE;

function navClass({ isActive }: { isActive: boolean }): string {
  return [
    'block rounded px-3 py-1.5 text-sm',
    isActive
      ? 'bg-primary text-primary-foreground font-medium'
      : 'text-muted-foreground hover:bg-muted hover:text-foreground',
  ].join(' ');
}

/** Siapp internal admin shell at admin.siapp.app — Google-SSO-only surface. */
export function AdminShell() {
  const { state, signOutUser } = useAdminAuth();
  const userEmail = state.status === 'signedIn' ? state.user.email : '';

  return (
    <>
      <SkipLink />
      <div className="flex min-h-screen">
        {/* Sidebar */}
        <aside className="flex w-52 shrink-0 flex-col border-r bg-muted/30 px-4 py-6">
          <div className="mb-6">
            <p className="text-sm font-semibold leading-tight">Siapp Admin</p>
            {environment !== 'production' && (
              <p className="text-xs text-muted-foreground">{environment}</p>
            )}
          </div>

          <nav aria-label="Admin navigation">
            <ul className="space-y-1">
              <li>
                <NavLink to="/" end className={navClass}>
                  Workspaces
                </NavLink>
              </li>
              <li>
                <NavLink to="/workspaces/new" className={navClass}>
                  Provision new
                </NavLink>
              </li>
              <li>
                <NavLink to="/audit-log" className={navClass}>
                  Audit log
                </NavLink>
              </li>
            </ul>
          </nav>

          <div className="mt-auto space-y-2 border-t pt-4">
            {userEmail !== null && userEmail !== '' && (
              <p className="truncate text-xs text-muted-foreground">{userEmail}</p>
            )}
            <Button variant="outline" size="sm" className="w-full" onClick={() => void signOutUser()}>
              Sign out
            </Button>
          </div>
        </aside>

        {/* Main content */}
        <main id="main" className="flex-1 overflow-auto px-8 py-8">
          <Outlet />
        </main>
      </div>
    </>
  );
}

