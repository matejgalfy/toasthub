import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { meQueryKey } from '@/features/auth/me-query';
import { jsonResponse, mockApi } from '@/test/api';
import { renderWithApp } from '@/test/render';
import { testSession, testUser } from '@/test/sessions';

import { OnboardingPage } from './onboarding-page';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('OnboardingPage', () => {
  it('checks the name, then saves the profile with the UI language', async () => {
    const user = userEvent.setup();
    const saved = { ...testUser, displayName: 'Ann', avatarId: 3, profileVisibility: 'clan' };
    const requests = mockApi(() => jsonResponse(200, { user: saved }));
    const { queryClient } = renderWithApp(<OnboardingPage />, { session: testSession('new') });

    const name = screen.getByLabelText('Display name');
    await user.type(name, 'A');
    await user.click(screen.getByRole('button', { name: 'Start toasting' }));
    expect(name).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByText('Use 2 to 30 characters.')).toBeInTheDocument();
    expect(requests).toHaveLength(0);

    await user.type(name, 'nn ');
    await user.click(screen.getByRole('radio', { name: 'Colour 3' }));
    await user.click(screen.getByRole('radio', { name: 'Clanmates only' }));
    await user.click(screen.getByRole('button', { name: 'Start toasting' }));

    await vi.waitFor(() => {
      expect(queryClient.getQueryData(meQueryKey)).toEqual(saved);
    });
    const [request] = requests;
    expect(request?.method).toBe('PATCH');
    expect(await request?.json()).toEqual({
      displayName: 'Ann',
      avatarId: 3,
      profileVisibility: 'clan',
      locale: 'en',
    });
  });

  it('shows the API error', async () => {
    const user = userEvent.setup();
    mockApi(() =>
      jsonResponse(500, { error: { code: 'INTERNAL', message: 'Internal server error' } }),
    );
    renderWithApp(<OnboardingPage />, { session: testSession('new') });

    await user.type(screen.getByLabelText('Display name'), 'Ann');
    await user.click(screen.getByRole('button', { name: 'Start toasting' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Something went wrong');
  });
});
