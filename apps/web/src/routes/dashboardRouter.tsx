import { Outlet, createBrowserRouter, type RouteObject } from 'react-router';

import { AuthProvider } from '@/surfaces/firm/auth/AuthProvider.tsx';
import { ForgotPasswordPage } from '@/surfaces/firm/auth/ForgotPasswordPage.tsx';
import { LoginPage } from '@/surfaces/firm/auth/LoginPage.tsx';
import { RequireAuth } from '@/surfaces/firm/auth/RequireAuth.tsx';
import { FirmShell } from '@/surfaces/firm/FirmShell.tsx';
import { ImpersonatePage } from '@/surfaces/firm/ImpersonatePage.tsx';
import { WorkspaceEntry } from '@/surfaces/firm/WorkspaceEntry.tsx';

function DashboardRoot() {
  return (
    <AuthProvider>
      <Outlet />
    </AuthProvider>
  );
}

/** Firm dashboard (dashboard.siapp.app) routes. */
export const dashboardRoutes: RouteObject[] = [
  {
    Component: DashboardRoot,
    children: [
      { path: '/login', Component: LoginPage },
      { path: '/forgot-password', Component: ForgotPasswordPage },
      // Outside RequireAuth: signs the browser in as the impersonated user.
      { path: '/impersonate', Component: ImpersonatePage },
      { path: '/', Component: WorkspaceEntry },
      {
        path: '/:workspaceSlug/*',
        element: (
          <RequireAuth>
            <FirmShell />
          </RequireAuth>
        ),
      },
    ],
  },
];

export function createDashboardRouter() {
  return createBrowserRouter(dashboardRoutes);
}
