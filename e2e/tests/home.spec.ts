import { fileURLToPath } from 'node:url';

import { expect, test, type Page } from '@playwright/test';

import { signUp } from '../support/auth.js';

const PHOTO = fileURLToPath(new URL('../fixtures/toast.jpg', import.meta.url));

/** The big number on a home stat card ("Today", "Streak 🔥"). */
function statValue(page: Page, label: string, value: string) {
  return page.getByRole('group', { name: label }).getByText(value, { exact: true });
}

/** Taps "+ Toast" and returns the dialog it opens. */
async function openLogDialog(page: Page) {
  await page.getByRole('button', { name: 'Toast', exact: true }).click();
  return page.getByRole('dialog', { name: 'Log toasts' });
}

test('"Toast" → "Log 1 toast" counts it and starts a streak', async ({ page }) => {
  await signUp(page);
  await expect(statValue(page, 'Today', '0')).toBeVisible();
  await expect(statValue(page, 'Streak 🔥', '0')).toBeVisible();

  const dialog = await openLogDialog(page);
  await dialog.getByRole('button', { name: 'Log 1 toast' }).click();

  await expect(dialog).toBeHidden();
  await expect(statValue(page, 'Today', '1')).toBeVisible();
  await expect(statValue(page, 'Streak 🔥', '1')).toBeVisible();
  await expect(page.getByText('Achievement unlocked: First Bite')).toBeVisible();

  // Saved on the server, not only in the optimistic update.
  await page.reload();
  await expect(statValue(page, 'Today', '1')).toBeVisible();
  await expect(statValue(page, 'Streak 🔥', '1')).toBeVisible();
});

test('several toasts with a photo are logged at once', async ({ page }) => {
  await signUp(page);

  const dialog = await openLogDialog(page);
  await dialog.getByRole('button', { name: 'One toast more' }).click();
  await dialog.getByRole('button', { name: 'One toast more' }).click();

  const chooser = page.waitForEvent('filechooser');
  await dialog.getByRole('button', { name: 'Add a photo' }).click();
  await (await chooser).setFiles(PHOTO);
  await expect(dialog.getByRole('img', { name: 'The photo you picked' })).toBeVisible();
  await dialog.getByRole('button', { name: 'Log 3 toasts' }).click();

  await expect(dialog).toBeHidden();
  await expect(statValue(page, 'Today', '3')).toBeVisible();
  await expect(page.getByText('Achievement unlocked: Shutterbug')).toBeVisible();

  await page.reload();
  await expect(statValue(page, 'Today', '3')).toBeVisible();
});
