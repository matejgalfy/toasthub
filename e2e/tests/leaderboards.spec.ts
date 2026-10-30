import { expect, test, type Locator, type Page } from '@playwright/test';

import { signUp } from '../support/auth.js';

// Names are unique because the database isn't reset between runs.
const suffix = () => Math.random().toString(36).slice(2, 8);

async function logToasts(page: Page, count: number) {
  await page.goto('/home');
  await page.getByRole('button', { name: 'Toast', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Log toasts' });
  for (let i = 1; i < count; i++) {
    await dialog.getByRole('button', { name: 'One toast more' }).click();
  }
  await dialog
    .getByRole('button', { name: count === 1 ? 'Log 1 toast' : `Log ${String(count)} toasts` })
    .click();
  await expect(dialog).toBeHidden();
}

/** The number in a row's "Rank n". */
async function rankIn(row: Locator): Promise<number> {
  const text = (await row.textContent()) ?? '';
  const match = /Rank (\d+)/.exec(text);
  if (!match) throw new Error(`No rank in "${text}"`);
  return Number(match[1]);
}

test('two users with different counts are ranked in order', async ({ page, browser }) => {
  const clanName = `E2E ${suffix()}`;
  const annName = `Ann ${suffix()}`;
  const bobName = `Bob ${suffix()}`;

  // A founds a clan, then logs 3 toasts, which count for it (D9).
  await signUp(page, annName);
  await page.goto('/clans/new');
  await page.getByRole('textbox', { name: 'Name' }).fill(clanName);
  await page.getByRole('button', { name: 'Create clan' }).click();
  await expect(page.getByRole('heading', { name: clanName, level: 1 })).toBeVisible();
  await logToasts(page, 3);

  // B joins on A's approval and logs 1 toast.
  const otherContext = await browser.newContext();
  const other = await otherContext.newPage();
  await signUp(other, bobName);
  await other.goto('/clans');
  await other.getByRole('searchbox', { name: 'Search clans' }).fill(clanName);
  await other.getByRole('link', { name: clanName }).click();
  await other.getByRole('button', { name: 'Request to join' }).click();
  await expect(
    other.getByText('Your request to join is waiting for the Toastmeister or a Vice-Toast.'),
  ).toBeVisible();

  await page.getByRole('link', { name: 'Clan', exact: true }).click();
  await page
    .getByRole('region', { name: 'Join requests' })
    .getByRole('button', { name: `Approve ${bobName}` })
    .click();
  await logToasts(other, 1);

  // The clan's own board: A first with 3, B second with 1.
  await page.getByRole('link', { name: 'Clan', exact: true }).click();
  await page.getByRole('tab', { name: 'Leaderboard' }).click();
  const members = page.getByRole('list', { name: 'Members by toasts' }).getByRole('listitem');
  await expect(members).toHaveCount(2);
  await expect(members.nth(0)).toContainText(annName);
  await expect(members.nth(0)).toContainText('Rank 1');
  await expect(members.nth(0)).toContainText('3 toasts');
  await expect(members.nth(1)).toContainText(bobName);
  await expect(members.nth(1)).toContainText('Rank 2');
  await expect(members.nth(1)).toContainText('1 toast');

  // The global board: other users' toasts come and go, but A always ranks above B.
  await page.getByRole('link', { name: 'Leaderboards' }).click();
  const annRow = page.getByRole('group', { name: 'You' });
  await expect(annRow).toContainText('3 toasts');
  await other.goto('/leaderboards');
  const bobRow = other.getByRole('group', { name: 'You' });
  await expect(bobRow).toContainText('1 toast');
  expect(await rankIn(annRow)).toBeLessThan(await rankIn(bobRow));

  // The clans board, this month: their clan with both sessions and a 1-day streak.
  await page.getByRole('tab', { name: 'Clans' }).click();
  const clanRow = page.getByRole('group', { name: 'Your clan' });
  await expect(clanRow).toContainText(clanName);
  await expect(clanRow).toContainText('4 toasts');
  await expect(clanRow).toContainText('Clan streak: 1 day');

  await otherContext.close();
});
