import { expect, test, type Page } from '@playwright/test';

import { openMagicLink } from '../support/auth.js';
import { magicLinkFor, uniqueEmail } from '../support/mailpit.js';

async function requestLink(page: Page, email: string) {
  await page.getByLabel('Email').fill(email);
  await page.getByRole('button', { name: 'Send login link' }).click();
  await expect(page.getByRole('heading', { name: 'Check your inbox' })).toBeVisible();
}

test('a new user signs up, finishes onboarding and lands on home', async ({ page }) => {
  const email = uniqueEmail();

  await page.goto('/');
  await page.getByRole('link', { name: 'Log in with email' }).click();
  await requestLink(page, email);

  await openMagicLink(page, await magicLinkFor(email));
  await expect(page).toHaveURL('/onboarding');

  await page.getByLabel('Display name').fill('E2E Toaster');
  await page.getByRole('radio', { name: 'Colour 2' }).click();
  await page.getByRole('radio', { name: 'Clanmates only' }).click();
  await page.getByRole('button', { name: 'Start toasting' }).click();

  await expect(page).toHaveURL('/home');
  await expect(page.getByRole('heading', { name: 'Home' })).toBeVisible();

  // A full page load keeps the session, and onboarding saved the profile.
  await page.goto('/settings');
  await expect(page.getByLabel('Display name')).toHaveValue('E2E Toaster');
  await expect(page.getByRole('radio', { name: 'Clanmates only' })).toBeChecked();
  await expect(page.getByText(`Signed in as ${email}`)).toBeVisible();
});

test('a used link shows an error and sends a new one', async ({ page }) => {
  const email = uniqueEmail();

  await page.goto('/login');
  await requestLink(page, email);
  const link = await magicLinkFor(email);
  await openMagicLink(page, link);
  await expect(page).toHaveURL('/onboarding');

  // The same link again, signed out.
  await page.context().clearCookies();
  await openMagicLink(page, link);
  await expect(page).toHaveURL(/\/auth\/callback\?error=/);
  await expect(page.getByText('This login link has expired or was already used.')).toBeVisible();

  // The email is remembered on this device, so one tap sends a new link.
  await expect(page.getByLabel('Email')).toHaveValue(email);
  await page.getByRole('button', { name: 'Send new link' }).click();
  await expect(page.getByRole('heading', { name: 'Check your inbox' })).toBeVisible();

  await openMagicLink(page, await magicLinkFor(email, { count: 2 }));
  await expect(page).toHaveURL('/onboarding');
});

test('logging out returns to the landing page', async ({ page }) => {
  const email = uniqueEmail();

  await page.goto('/login');
  await requestLink(page, email);
  await openMagicLink(page, await magicLinkFor(email));
  await page.getByLabel('Display name').fill('Leaver');
  await page.getByRole('button', { name: 'Start toasting' }).click();
  await expect(page).toHaveURL('/home');

  await page.getByRole('link', { name: 'Settings' }).click();
  await page.getByRole('button', { name: 'Log out' }).click();
  await expect(page).toHaveURL('/');

  await page.goto('/home');
  await expect(page).toHaveURL('/login');
});
