import { QueryClientProvider } from '@tanstack/react-query';
import { createBrowserRouter } from 'react-router';
import { RouterProvider } from 'react-router/dom';

import { createQueryClient } from '@/api/query-client';
import { meQueryKey } from '@/features/auth/me-query';
import { ApiSessionProvider } from '@/features/auth/session';
import { routes } from '@/routes';

const queryClient = createQueryClient({
  // The guards then send the user to /login.
  onUnauthenticated: () => {
    queryClient.setQueryData(meQueryKey, null);
  },
});
const router = createBrowserRouter(routes);

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ApiSessionProvider>
        <RouterProvider router={router} />
      </ApiSessionProvider>
    </QueryClientProvider>
  );
}
