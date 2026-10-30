import { expect, test, type Page } from '@playwright/test';

import { signUp } from '../support/auth.js';
import { execute } from '../support/db.js';

// The most one log can hold: over the default threshold of 8 (SPEC §4.13), with room if it was raised a bit.
const TOASTS = 10;

async function logToasts(page: Page, count: number) {
  await page.goto('/home');
  await page.getByRole('button', { name: 'Toast', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Log toasts' });
  for (let i = 1; i < count; i++) {
    await dialog.getByRole('button', { name: 'One toast more' }).click();
  }
  await dialog.getByRole('button', { name: `Log ${String(count)} toasts` }).click();
  await expect(dialog).toBeHidden();
}

test("rejecting a flagged day's toasts takes them off the leaderboard", async ({
  page,
  browser,
}) => {
  const name = `Flagged ${Math.random().toString(36).slice(2, 8)}`;

  // The user logs more toasts in one day than the threshold allows, which opens a count flag.
  await signUp(page, name);
  await logToasts(page, TOASTS);
  await page.goto('/leaderboards');
  const mine = page.getByRole('group', { name: 'You' });
  await expect(mine).toContainText(`${String(TOASTS)} toasts`);

  // An admin (made one in the database, like `admin:promote`) finds the flag in the queue.
  const adminContext = await browser.newContext();
  const admin = await adminContext.newPage();
  const adminEmail = await signUp(admin, 'E2E Admin');
  await execute(`UPDATE "user" SET role = 'admin' WHERE email = '${adminEmail}'`);
  await admin.reload();
  await admin.getByRole('link', { name: 'Admin' }).click();
  await expect(admin).toHaveURL('/admin/flags');
  await admin.getByLabel('Type').selectOption({ label: 'Daily count' });

  const flag = admin
    .getByRole('list', { name: 'Flags' })
    .getByRole('listitem')
    .filter({ hasText: name });
  await expect(flag).toContainText(`Counting${String(TOASTS)}`);
  await flag.getByRole('button', { name: `Resolve the flag on ${name}` }).click();
  const dialog = admin.getByRole('dialog', { name: `Resolve the flag on ${name}` });
  await dialog.getByLabel("Reject the day's toasts").click();
  await dialog.getByRole('button', { name: 'Resolve' }).click();
  await expect(dialog).toBeHidden();
  // Resolved flags leave the open queue.
  await expect(flag).toHaveCount(0);

  // The user's toasts no longer count.
  await page.reload();
  await expect(mine).toContainText('No toasts from you this week yet.');

  await adminContext.close();
});
