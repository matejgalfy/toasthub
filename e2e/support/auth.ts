import { expect, type Page } from '@playwright/test';

import { resetVerifyRateLimit } from './db.js';
import { magicLinkFor, uniqueEmail } from './mailpit.js';

const VERIFY_ATTEMPTS = 3;

/** Opens a magic link from an email. Use this instead of `page.goto(link)` (see `resetVerifyRateLimit`). */
export async function openMagicLink(page: Page, link: string): Promise<void> {
  // Parallel workers verify in a burst, so one can still hit the limit between resets (429) or race
  // another on the limiter's row (500). Both are answered before the token is used, so it's opened again.
  for (let attempt = 1; ; attempt++) {
    await resetVerifyRateLimit();
    const status = (await page.goto(link))?.status() ?? 0;
    if (attempt === VERIFY_ATTEMPTS || (status !== 429 && status < 500)) return;
  }
}

/** Signs up a fresh user through the UI and finishes onboarding; the page ends on `/home`. */
export async function signUp(page: Page, displayName = 'E2E Toaster'): Promise<string> {
  const email = uniqueEmail();
  await page.goto('/login');
  await page.getByLabel('Email').fill(email);
  await page.getByRole('button', { name: 'Send login link' }).click();
  await expect(page.getByRole('heading', { name: 'Check your inbox' })).toBeVisible();

  await openMagicLink(page, await magicLinkFor(email));
  await page.getByLabel('Display name').fill(displayName);
  await page.getByRole('button', { name: 'Start toasting' }).click();
  await expect(page).toHaveURL('/home');
  return email;
}
