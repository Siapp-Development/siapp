import '@siapp/ui/styles/globals.css';

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router/dom';

import { AppErrorBoundary } from '@/components/AppErrorBoundary.tsx';
import { initSentry } from '@/lib/initSentry.ts';
import { installGlobalErrorHandlers } from '@/lib/reportError.ts';
import { createDashboardRouter } from '@/routes/dashboardRouter.tsx';

installGlobalErrorHandlers('dashboard');
initSentry('dashboard');

const container = document.getElementById('root');

if (container === null) {
  throw new Error('Root element #root not found in dashboard.html');
}

createRoot(container).render(
  <StrictMode>
    <AppErrorBoundary surface="dashboard">
      <RouterProvider router={createDashboardRouter()} />
    </AppErrorBoundary>
  </StrictMode>,
);
