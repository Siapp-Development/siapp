import { createBrowserRouter, type RouteObject } from 'react-router';

import { FirmShell } from '@/surfaces/firm/FirmShell.tsx';
import { WorkspaceEntry } from '@/surfaces/firm/WorkspaceEntry.tsx';

/** Firm dashboard (dashboard.siapp.app) routes. */
export const dashboardRoutes: RouteObject[] = [
  { path: '/', Component: WorkspaceEntry },
  { path: '/:workspaceSlug/*', Component: FirmShell },
];

export function createDashboardRouter() {
  return createBrowserRouter(dashboardRoutes);
}
