import '@siapp/ui/styles/globals.css';

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router/dom';

import { createApexRouter } from '@/routes/apexRouter.tsx';

const container = document.getElementById('root');

if (container === null) {
  throw new Error('Root element #root not found in apex.html');
}

createRoot(container).render(
  <StrictMode>
    <RouterProvider router={createApexRouter()} />
  </StrictMode>,
);
