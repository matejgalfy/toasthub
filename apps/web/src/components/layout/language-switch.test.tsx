import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useTranslation } from 'react-i18next';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { changeLocale } from '@/i18n';
import { jsonResponse, mockApi } from '@/test/api';
import { renderWithApp } from '@/test/render';
import { testSession, testUser } from '@/test/sessions';

import { LanguageSwitch } from './language-switch';

function Greeting() {
  const { t } = useTranslation();
  return <p>{t('nav.home')}</p>;
}

const ui = (
  <>
    <LanguageSwitch />
    <Greeting />
  </>
);

describe('LanguageSwitch', () => {
  afterEach(async () => {
    vi.restoreAllMocks();
    await changeLocale('en');
  });

  it('switches the UI language and the document language', async () => {
    const user = userEvent.setup();
    const requests = mockApi(() => jsonResponse(500, {}));
    renderWithApp(ui, { session: testSession('anonymous') });
    expect(screen.getByText('Home')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /English/ })).toHaveAttribute('aria-pressed', 'true');

    await user.click(screen.getByRole('button', { name: /Slovenčina/ }));

    expect(screen.getByText('Domov')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Slovenčina/ })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(document.documentElement.lang).toBe('sk');
    // Nobody to save it for.
    expect(requests).toHaveLength(0);
  });

  it("saves a signed-in user's choice to their profile", async () => {
    const user = userEvent.setup();
    const requests = mockApi(() => jsonResponse(200, { user: { ...testUser, locale: 'sk' } }));
    renderWithApp(ui, { session: testSession('user') });

    await user.click(screen.getByRole('button', { name: /Slovenčina/ }));

    await vi.waitFor(() => {
      expect(requests).toHaveLength(1);
    });
    expect(await requests[0]?.json()).toEqual({ locale: 'sk' });
  });
});
