import { render, screen } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { describe, expect, it } from 'vitest';

import { testSession, type SessionKind } from '@/test/sessions';

import { RedirectIfAuthenticated, RequireAdmin, RequireAuth, RequireOnboarded } from './guards';
import { SessionProvider, type Session } from './session';

function renderAt(path: string, session: Session) {
  const page = (name: string) => ({ element: <p>{name}</p> });
  const router = createMemoryRouter(
    [
      {
        element: <RedirectIfAuthenticated />,
        children: [{ path: '/', ...page('landing') }],
      },
      { path: '/login', ...page('login') },
      {
        element: <RequireAuth />,
        children: [{ path: '/onboarding', ...page('onboarding') }],
      },
      {
        element: <RequireOnboarded />,
        children: [
          { path: '/home', ...page('home') },
          { element: <RequireAdmin />, children: [{ path: '/admin', ...page('admin') }] },
        ],
      },
    ],
    { initialEntries: [path] },
  );
  render(
    <SessionProvider value={session}>
      <RouterProvider router={router} />
    </SessionProvider>,
  );
}

describe('route guards', () => {
  it.each<[string, SessionKind, string]>([
    ['/', 'anonymous', 'landing'],
    ['/', 'user', 'home'],
    ['/onboarding', 'anonymous', 'login'],
    ['/onboarding', 'new', 'onboarding'],
    ['/home', 'anonymous', 'login'],
    ['/home', 'new', 'onboarding'],
    ['/home', 'user', 'home'],
    ['/admin', 'anonymous', 'login'],
    ['/admin', 'new', 'onboarding'],
    ['/admin', 'user', 'home'],
    ['/admin', 'admin', 'admin'],
  ])('%s as %s shows %s', async (path, kind, expected) => {
    renderAt(path, testSession(kind));
    expect(await screen.findByText(expected)).toBeInTheDocument();
  });

  it('shows a spinner while the session is loading', () => {
    renderAt('/home', { status: 'loading' });
    expect(screen.getByRole('status')).toHaveTextContent('Loading…');
  });
});
