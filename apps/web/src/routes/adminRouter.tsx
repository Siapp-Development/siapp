import { Outlet, createBrowserRouter, type RouteObject } from 'react-router';

import { AdminAuthProvider } from '@/surfaces/admin/auth/AdminAuthProvider.tsx';
import { AdminLoginPage } from '@/surfaces/admin/auth/AdminLoginPage.tsx';
import { AdminRequireAuth } from '@/surfaces/admin/auth/AdminRequireAuth.tsx';
import { AdminAuditLogPage } from '@/surfaces/admin/pages/AdminAuditLogPage.tsx';
import { ProvisionWorkspacePage } from '@/surfaces/admin/pages/ProvisionWorkspacePage.tsx';
import { WorkspaceDetailPage } from '@/surfaces/admin/pages/WorkspaceDetailPage.tsx';
import { WorkspaceListPage } from '@/surfaces/admin/pages/WorkspaceListPage.tsx';
import { AdminShell } from '@/surfaces/admin/AdminShell.tsx';

function AdminRoot() {
  return (
    <AdminAuthProvider>
      <Outlet />
    </AdminAuthProvider>
  );
}

/** Siapp admin (admin.siapp.app) routes. */
export const adminRoutes: RouteObject[] = [
  {
    Component: AdminRoot,
    children: [
      { path: '/login', Component: AdminLoginPage },
      {
        path: '/',
        element: (
          <AdminRequireAuth>
            <AdminShell />
          </AdminRequireAuth>
        ),
        children: [
          { index: true, Component: WorkspaceListPage },
          { path: 'workspaces/new', Component: ProvisionWorkspacePage },
          { path: 'workspaces/:wid', Component: WorkspaceDetailPage },
          { path: 'audit-log', Component: AdminAuditLogPage },
        ],
      },
    ],
  },
];

export function createAdminRouter() {
  return createBrowserRouter(adminRoutes);
}
