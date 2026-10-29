import { QueryClientProvider } from '@tanstack/react-query';
import { createBrowserRouter } from 'react-router';
import { RouterProvider } from 'react-router/dom';

import { createQueryClient } from '@/api/query-client';
import { PreviewSessionProvider } from '@/features/auth/preview-session';
import { routes } from '@/routes';

const queryClient = createQueryClient();
const router = createBrowserRouter(routes);

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      {/* M5: replace with a provider that reads GET /me. */}
      <PreviewSessionProvider>
        <RouterProvider router={router} />
      </PreviewSessionProvider>
    </QueryClientProvider>
  );
}
