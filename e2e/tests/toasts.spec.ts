import { expect, test, type Page } from '@playwright/test';

import { signUp } from '../support/auth.js';
import { logToasts, pickPhoto } from '../support/toasts.js';

/** The big number on the home "Streak 🔥" card. */
function streak(page: Page, value: string) {
  return page.getByRole('group', { name: 'Streak 🔥' }).getByText(value, { exact: true });
}

async function goHome(page: Page) {
  await page.getByRole('link', { name: 'Home', exact: true }).click();
  await expect(page).toHaveURL('/home');
  await expect(page.getByRole('group', { name: 'Streak 🔥' })).toBeVisible();
}

/** My toasts is linked from the own profile. */
async function goToMyToasts(page: Page) {
  await page.getByRole('link', { name: 'Profile', exact: true }).click();
  await page.getByRole('link', { name: 'My toasts' }).click();
  await expect(page.getByRole('heading', { name: 'My toasts', level: 1 })).toBeVisible();
}

test('a session is edited on My toasts and home follows', async ({ page }) => {
  await signUp(page);

  await logToasts(page, 2);
  await expect(streak(page, '1')).toBeVisible();

  // One log is one session of two toasts.
  await goToMyToasts(page);
  const today = page.getByRole('region', { name: 'Today' });
  await expect(today.getByRole('listitem')).toHaveCount(1);
  await today.getByRole('button', { name: /2 toasts/ }).click();

  const edit = page.getByRole('dialog', { name: 'Edit toasts' });
  await edit.getByRole('button', { name: 'One toast more' }).click();
  // The photo can be replaced, never removed (SPEC §12 D64).
  await expect(edit.getByRole('button', { name: 'Remove photo' })).toHaveCount(0);
  await pickPhoto(page, edit, 'Choose another');
  await edit.getByRole('button', { name: 'Save changes' }).click();
  await expect(edit).toBeHidden();

  const row = today.getByRole('button', { name: /3 toasts/ });
  await expect(row).toBeVisible();
  await expect(row.getByRole('img')).toBeVisible();

  await goHome(page);
  await expect(streak(page, '1')).toBeVisible();

  await goToMyToasts(page);
  await today.getByRole('button', { name: /3 toasts/ }).click();
  await edit.getByRole('button', { name: 'Delete' }).click();
  const confirm = page.getByRole('dialog', { name: 'Delete these toasts?' });
  await confirm.getByRole('button', { name: 'Delete' }).click();
  await expect(confirm).toBeHidden();
  await expect(page.getByText(/No toasts yet/)).toBeVisible();

  await goHome(page);
  await expect(streak(page, '0')).toBeVisible();
});
