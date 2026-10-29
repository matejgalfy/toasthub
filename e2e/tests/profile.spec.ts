import { expect, test, type Page } from '@playwright/test';

import { signUp } from '../support/auth.js';

async function goToProfile(page: Page) {
  await page.getByRole('link', { name: 'Profile', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'E2E Toaster', level: 1 })).toBeVisible();
}

/** The big number on the profile's "Total" stat card. */
function total(page: Page, value: string) {
  return page.getByRole('group', { name: 'Total' }).getByText(value, { exact: true });
}

function achievement(page: Page, name: string) {
  return page
    .getByRole('region', { name: 'Achievements' })
    .getByRole('listitem')
    .filter({ hasText: name });
}

test('the profile follows logged and deleted toasts; achievements stay', async ({ page }) => {
  await signUp(page);

  const log = page.getByRole('dialog', { name: 'Log toasts' });
  await page.getByRole('button', { name: 'Toast', exact: true }).click();
  await log.getByRole('button', { name: 'Log 1 toast' }).click();
  await expect(log).toBeHidden();
  await expect(page.getByText('Achievement unlocked: First Bite')).toBeVisible();

  await goToProfile(page);
  await expect(total(page, '1')).toBeVisible();
  // Today's square is the only day with a toast.
  await expect(page.getByRole('img', { name: /: 1 toast$/ })).toHaveCount(1);
  await expect(achievement(page, 'First Bite')).toContainText('Earned');
  await expect(achievement(page, 'Shutterbug')).toContainText('Not earned yet');

  // Editing happens on My toasts, linked from the own profile.
  await page.getByRole('link', { name: 'My toasts' }).click();
  await expect(page.getByRole('heading', { name: 'My toasts', level: 1 })).toBeVisible();
  await page
    .getByRole('region', { name: 'Today' })
    .getByRole('button', { name: /1 toast/ })
    .click();
  await page
    .getByRole('dialog', { name: 'Edit toasts' })
    .getByRole('button', { name: 'Delete' })
    .click();
  const confirm = page.getByRole('dialog', { name: 'Delete these toasts?' });
  await confirm.getByRole('button', { name: 'Delete' }).click();
  await expect(page.getByText(/No toasts yet/)).toBeVisible();

  await goToProfile(page);
  await expect(total(page, '0')).toBeVisible();
  await expect(page.getByRole('img', { name: /: 1 toast$/ })).toHaveCount(0);
  await expect(achievement(page, 'First Bite')).toContainText('Earned');
});
