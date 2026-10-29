import { describe, expect, it } from 'vitest';

import { localeFromAcceptLanguage, renderMagicLinkEmail } from './magic-link-email';

const url = 'http://localhost:3000/api/v1/auth/magic-link/verify?token=abc&callbackURL=%2F';

describe('renderMagicLinkEmail', () => {
  it.each([
    ['sk', 'Tvoj prihlasovací odkaz do Toasthubu', '15 minút'],
    ['en', 'Your Toasthub sign-in link', '15 minutes'],
  ] as const)('renders %s', (locale, subject, validity) => {
    const email = renderMagicLinkEmail(locale, url);
    expect(email.subject).toBe(subject);
    expect(email.text).toContain(url);
    expect(email.text).toContain(validity);
    expect(email.html).toContain(`lang="${locale}"`);
  });

  it('escapes the link in HTML', () => {
    const { html } = renderMagicLinkEmail('en', url);
    expect(html).toContain('token=abc&amp;callbackURL=%2F');
    expect(html).not.toContain('token=abc&callbackURL');
  });
});

describe('localeFromAcceptLanguage', () => {
  it.each([
    [undefined, 'en'],
    ['', 'en'],
    ['de-DE,de;q=0.9', 'en'],
    ['sk-SK,sk;q=0.9,en;q=0.8', 'sk'],
    ['en-US,en;q=0.9,sk;q=0.8', 'en'],
    ['cs,sk;q=0.7,en;q=0.9', 'en'],
    ['de;q=1, SK;q=0.5', 'sk'],
    ['sk;q=0', 'en'],
  ])('%s → %s', (header, locale) => {
    expect(localeFromAcceptLanguage(header)).toBe(locale);
  });
});
