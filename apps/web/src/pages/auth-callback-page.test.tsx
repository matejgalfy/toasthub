import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { renderWithApp } from '@/test/render';
import { testSession } from '@/test/sessions';

import { AuthCallbackPage } from './auth-callback-page';

const landings = ['/home', '/onboarding', '/u/1'].map((path) => ({
  path,
  element: <p>at {path}</p>,
}));

describe('AuthCallbackPage', () => {
  it('sends a new user to onboarding', async () => {
    renderWithApp(<AuthCallbackPage />, {
      session: testSession('new'),
      path: '/auth/callback?next=/u/1',
      routes: landings,
    });
    expect(await screen.findByText('at /onboarding')).toBeInTheDocument();
  });

  it('sends an onboarded user to the page they came from', async () => {
    renderWithApp(<AuthCallbackPage />, {
      session: testSession('user'),
      path: '/auth/callback?next=/u/1',
      routes: landings,
    });
    expect(await screen.findByText('at /u/1')).toBeInTheDocument();
  });

  it('offers a new link for a used or expired one', async () => {
    renderWithApp(<AuthCallbackPage />, {
      session: testSession('anonymous'),
      path: '/auth/callback?error=INVALID_TOKEN',
    });
    expect(await screen.findByText(/expired or was already used/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Send new link' })).toBeInTheDocument();
  });

  it('explains other failures generically', async () => {
    renderWithApp(<AuthCallbackPage />, {
      session: testSession('anonymous'),
      path: '/auth/callback?error=failed_to_create_session',
    });
    expect(await screen.findByText(/couldn't log you in/)).toBeInTheDocument();
  });
});
