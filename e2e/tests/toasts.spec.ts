import { fileURLToPath } from 'node:url';

import { expect, test, type Page } from '@playwright/test';

import { signUp } from '../support/auth.js';

const PHOTO = fileURLToPath(new URL('../fixtures/toast.jpg', import.meta.url));

/** The big number on the home "Today" card. */
function todayCount(page: Page, value: string) {
  return page.getByRole('group', { name: 'Today' }).getByText(value, { exact: true });
}

async function goHome(page: Page) {
  await page.getByRole('link', { name: 'Home', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Home', level: 1 })).toBeVisible();
}

async function goToMyToasts(page: Page) {
  await page.getByRole('link', { name: 'My toasts' }).click();
  await expect(page.getByRole('heading', { name: 'My toasts', level: 1 })).toBeVisible();
}

test('a session is edited on My toasts and home follows', async ({ page }) => {
  await signUp(page);

  const log = page.getByRole('dialog', { name: 'Log toasts' });
  await page.getByRole('button', { name: 'Toast', exact: true }).click();
  await log.getByRole('button', { name: 'One toast more' }).click();
  await log.getByRole('button', { name: 'Log 2 toasts' }).click();
  await expect(log).toBeHidden();
  await expect(todayCount(page, '2')).toBeVisible();

  // One log is one session of two toasts.
  await goToMyToasts(page);
  const today = page.getByRole('region', { name: 'Today' });
  await expect(today.getByRole('listitem')).toHaveCount(1);
  await today.getByRole('button', { name: /2 toasts/ }).click();

  const edit = page.getByRole('dialog', { name: 'Edit toasts' });
  await edit.getByRole('button', { name: 'One toast more' }).click();
  const chooser = page.waitForEvent('filechooser');
  await edit.getByRole('button', { name: 'Add a photo' }).click();
  await (await chooser).setFiles(PHOTO);
  await expect(edit.getByRole('img', { name: 'The photo you picked' })).toBeVisible();
  await edit.getByRole('button', { name: 'Save changes' }).click();
  await expect(edit).toBeHidden();
  await expect(page.getByText('Achievement unlocked: Shutterbug')).toBeVisible();

  const row = today.getByRole('button', { name: /3 toasts/ });
  await expect(row).toBeVisible();
  await expect(row.getByRole('img')).toBeVisible();

  await goHome(page);
  await expect(todayCount(page, '3')).toBeVisible();

  await goToMyToasts(page);
  await today.getByRole('button', { name: /3 toasts/ }).click();
  await edit.getByRole('button', { name: 'Delete' }).click();
  const confirm = page.getByRole('dialog', { name: 'Delete these toasts?' });
  await confirm.getByRole('button', { name: 'Delete' }).click();
  await expect(confirm).toBeHidden();
  await expect(page.getByText(/No toasts yet/)).toBeVisible();

  await goHome(page);
  await expect(todayCount(page, '0')).toBeVisible();
});
