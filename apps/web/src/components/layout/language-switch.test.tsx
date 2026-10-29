import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useTranslation } from 'react-i18next';
import { afterEach, describe, expect, it } from 'vitest';

import { changeLocale } from '@/i18n';

import { LanguageSwitch } from './language-switch';

function Greeting() {
  const { t } = useTranslation();
  return <p>{t('nav.home')}</p>;
}

describe('LanguageSwitch', () => {
  afterEach(async () => {
    await changeLocale('en');
  });

  it('switches the UI language and the document language', async () => {
    const user = userEvent.setup();
    render(
      <>
        <LanguageSwitch />
        <Greeting />
      </>,
    );
    expect(screen.getByText('Home')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /English/ })).toHaveAttribute('aria-pressed', 'true');

    await user.click(screen.getByRole('button', { name: /Slovenčina/ }));

    expect(screen.getByText('Domov')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Slovenčina/ })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(document.documentElement.lang).toBe('sk');
  });
});
