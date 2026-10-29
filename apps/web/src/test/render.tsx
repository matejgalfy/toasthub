import { QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import type { ReactNode } from 'react';
import { createMemoryRouter, RouterProvider, type RouteObject } from 'react-router';

import { createQueryClient } from '@/api/query-client';
import { SessionProvider, type Session } from '@/features/auth/session';

interface RenderOptions {
  session: Session;
  /** Start URL; defaults to `/`. */
  path?: string;
  /** Extra routes, e.g. `{ path: '/home', element: <p>home</p> }` to see where a redirect lands. */
  routes?: RouteObject[];
}

/** Renders `ui` at `path` with a fresh query client, a fixed session and a memory router. */
export function renderWithApp(ui: ReactNode, { session, path = '/', routes = [] }: RenderOptions) {
  const queryClient = createQueryClient();
  const router = createMemoryRouter(
    [{ path: new URL(path, 'http://x').pathname, element: ui }, ...routes],
    {
      initialEntries: [path],
    },
  );
  render(
    <QueryClientProvider client={queryClient}>
      <SessionProvider value={session}>
        <RouterProvider router={router} />
      </SessionProvider>
    </QueryClientProvider>,
  );
  return { queryClient, router };
}
