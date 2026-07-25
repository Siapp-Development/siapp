import '@siapp/ui/styles/globals.css';

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router/dom';

import { AppErrorBoundary } from '@/components/AppErrorBoundary.tsx';
import { initSentry } from '@/lib/initSentry.ts';
import { installGlobalErrorHandlers } from '@/lib/reportError.ts';
import { createAdminRouter } from '@/routes/adminRouter.tsx';

installGlobalErrorHandlers('admin');
initSentry('admin');

const container = document.getElementById('root');

if (container === null) {
  throw new Error('Root element #root not found in admin.html');
}

createRoot(container).render(
  <StrictMode>
    <AppErrorBoundary surface="admin">
      <RouterProvider router={createAdminRouter()} />
    </AppErrorBoundary>
  </StrictMode>,
);
