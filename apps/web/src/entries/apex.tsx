import '@siapp/ui/styles/globals.css';

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router/dom';

import { AppErrorBoundary } from '@/components/AppErrorBoundary.tsx';
import { initSentry } from '@/lib/initSentry.ts';
import { installGlobalErrorHandlers } from '@/lib/reportError.ts';
import { createApexRouter } from '@/routes/apexRouter.tsx';

installGlobalErrorHandlers('apex');
initSentry('apex');

const container = document.getElementById('root');

if (container === null) {
  throw new Error('Root element #root not found in apex.html');
}

createRoot(container).render(
  <StrictMode>
    <AppErrorBoundary surface="apex">
      <RouterProvider router={createApexRouter()} />
    </AppErrorBoundary>
  </StrictMode>,
);
