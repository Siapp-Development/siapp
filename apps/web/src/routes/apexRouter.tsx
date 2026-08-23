import { createBrowserRouter, type RouteObject } from 'react-router';

import { LoadingFallback } from '@/components/LoadingFallback.tsx';
import { NotFoundScreen, RouteErrorFallback } from '@/components/RouteErrorFallback.tsx';
import { MarketingHome } from '@/surfaces/marketing/MarketingHome.tsx';

/**
 * Apex (siapp.app) routes: eager marketing root plus the two external trees.
 * /p and /t use route-level lazy() so each tree is a separate chunk — the
 * bundle-isolation CI check asserts this against the Vite manifest.
 * Each tree root carries its own errorElement (#27, D2) so portal/collab
 * errors render inside their own chunk-boundary semantics, never a blank
 * screen or marketing-flavored UI.
 */
export const apexRoutes: RouteObject[] = [
  { path: '/', Component: MarketingHome, errorElement: <RouteErrorFallback surface="apex" /> },
  {
    path: '/p/:token',
    HydrateFallback: LoadingFallback,
    errorElement: <RouteErrorFallback surface="portal" />,
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
    errorElement: <RouteErrorFallback surface="collab" />,
    lazy: async () => {
      const { CollabTaskPage } = await import('@/surfaces/collab/CollabTaskPage.tsx');
      return { Component: CollabTaskPage };
    },
  },
  // Public legal pages (#100). Grouped so Vite emits one shared `legal` chunk;
  // apex-only modules, no firm/admin imports (D-036/D-037). Placed before the
  // catch-all so they resolve to their pages, not NotFoundScreen.
  {
    path: '/privacy',
    HydrateFallback: LoadingFallback,
    errorElement: <RouteErrorFallback surface="apex" />,
    lazy: async () => {
      const { PrivacyPolicyPage } = await import(
        '@/surfaces/marketing/legal/PrivacyPolicyPage.tsx'
      );
      return { Component: PrivacyPolicyPage };
    },
  },
  {
    path: '/terms',
    HydrateFallback: LoadingFallback,
    errorElement: <RouteErrorFallback surface="apex" />,
    lazy: async () => {
      const { TermsPage } = await import('@/surfaces/marketing/legal/TermsPage.tsx');
      return { Component: TermsPage };
    },
  },
  {
    path: '/legal/campaign-privacy',
    HydrateFallback: LoadingFallback,
    errorElement: <RouteErrorFallback surface="apex" />,
    lazy: async () => {
      const { CampaignPrivacyPage } = await import(
        '@/surfaces/marketing/legal/CampaignPrivacyPage.tsx'
      );
      return { Component: CampaignPrivacyPage };
    },
  },
  {
    path: '/legal/sms-terms',
    HydrateFallback: LoadingFallback,
    errorElement: <RouteErrorFallback surface="apex" />,
    lazy: async () => {
      const { SmsTermsPage } = await import('@/surfaces/marketing/legal/SmsTermsPage.tsx');
      return { Component: SmsTermsPage };
    },
  },
  // Apex has no layout route, so unknown paths would otherwise fall through
  // to React Router's default error screen (a blank page in production).
  { path: '*', Component: NotFoundScreen },
];

export function createApexRouter() {
  return createBrowserRouter(apexRoutes);
}
