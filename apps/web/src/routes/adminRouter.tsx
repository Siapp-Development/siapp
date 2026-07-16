import { createBrowserRouter, type RouteObject } from 'react-router';

import { AdminShell } from '@/surfaces/admin/AdminShell.tsx';

/** Siapp admin (admin.siapp.app) routes. */
export const adminRoutes: RouteObject[] = [{ path: '/', Component: AdminShell }];

export function createAdminRouter() {
  return createBrowserRouter(adminRoutes);
}
