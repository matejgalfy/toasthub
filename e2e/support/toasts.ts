import { fileURLToPath } from 'node:url';

import { expect, type Locator, type Page } from '@playwright/test';

/** A JPEG for the photo every toast session needs (SPEC §4.3 BR-TOAST-2). */
export const PHOTO = fileURLToPath(new URL('../fixtures/toast.jpg', import.meta.url));

/** Picks `PHOTO` in `dialog` through its photo button ("Add a photo" or "Choose another"). */
export async function pickPhoto(page: Page, dialog: Locator, button = 'Add a photo') {
  const chooser = page.waitForEvent('filechooser');
  await dialog.getByRole('button', { name: button }).click();
  await (await chooser).setFiles(PHOTO);
  await expect(dialog.getByRole('img', { name: 'The photo you picked' })).toBeVisible();
}

/** Logs `count` toasts with a photo from the home screen and waits for the dialog to close. */
export async function logToasts(page: Page, count = 1) {
  await page.getByRole('button', { name: 'Toast', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Log toasts' });
  for (let i = 1; i < count; i++) {
    await dialog.getByRole('button', { name: 'One toast more' }).click();
  }
  await pickPhoto(page, dialog);
  await dialog
    .getByRole('button', { name: count === 1 ? 'Log 1 toast' : `Log ${String(count)} toasts` })
    .click();
  await expect(dialog).toBeHidden();
}
