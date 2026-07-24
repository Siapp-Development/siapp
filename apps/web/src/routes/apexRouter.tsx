import { createBrowserRouter, type RouteObject } from 'react-router';

import { LoadingFallback } from '@/components/LoadingFallback.tsx';
import { MarketingHome } from '@/surfaces/marketing/MarketingHome.tsx';

/**
 * Apex (siapp.app) routes: eager marketing root plus the two external trees.
 * /p and /t use route-level lazy() so each tree is a separate chunk — the
 * bundle-isolation CI check asserts this against the Vite manifest.
 */
export const apexRoutes: RouteObject[] = [
  { path: '/', Component: MarketingHome },
  {
    path: '/p/:token',
    HydrateFallback: LoadingFallback,
    lazy: async () => {
      const { PortalShell } = await import('@/surfaces/portal/PortalShell.tsx');
      return { Component: PortalShell };
    },
    children: [
      {
        index: true,
        lazy: async () => {
          const { PortalProjectPage } = await import('@/surfaces/portal/PortalProjectPage.tsx');
          return { Component: PortalProjectPage };
        },
      },
      {
        path: 'documents',
        lazy: async () => {
          const { PortalDocumentsPage } = await import(
            '@/surfaces/portal/documents/PortalDocumentsPage.tsx'
          );
          return { Component: PortalDocumentsPage };
        },
      },
      {
        path: 'updates',
        lazy: async () => {
          const { PortalUpdatesPage } = await import(
            '@/surfaces/portal/updates/PortalUpdatesPage.tsx'
          );
          return { Component: PortalUpdatesPage };
        },
      },
    ],
  },
  {
    path: '/t/:token',
    HydrateFallback: LoadingFallback,
    lazy: async () => {
      const { CollabTaskPage } = await import('@/surfaces/collab/CollabTaskPage.tsx');
      return { Component: CollabTaskPage };
    },
  },
];

export function createApexRouter() {
  return createBrowserRouter(apexRoutes);
}
