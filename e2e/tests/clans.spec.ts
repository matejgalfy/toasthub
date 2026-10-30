import { expect, test, type Page } from '@playwright/test';

import { signUp } from '../support/auth.js';

/** Clan names are unique and the database isn't reset between runs. */
function uniqueClanName(): string {
  return `E2E ${Math.random().toString(36).slice(2, 10)}`;
}

async function openClanTab(page: Page) {
  await page.getByRole('link', { name: 'Clan', exact: true }).click();
}

test('a clan is founded, joined on approval, and its feed liked', async ({ page, browser }) => {
  const clanName = uniqueClanName();

  // A logs a toast, then founds the clan from the browser.
  await signUp(page, 'Ann Founder');
  const log = page.getByRole('dialog', { name: 'Log toasts' });
  await page.getByRole('button', { name: 'Toast', exact: true }).click();
  await log.getByRole('button', { name: 'Log 1 toast' }).click();
  await expect(log).toBeHidden();

  await openClanTab(page);
  await expect(page.getByRole('heading', { name: 'Clans', level: 1 })).toBeVisible();
  await page.getByRole('link', { name: 'Create clan' }).click();
  await page.getByRole('textbox', { name: 'Name' }).fill(clanName);
  await page.getByRole('textbox', { name: 'Description' }).fill('Two slices a day');
  await page.getByRole('button', { name: 'Create clan' }).click();
  await expect(page.getByRole('heading', { name: clanName, level: 1 })).toBeVisible();
  await expect(page.getByText('Achievement unlocked: Clansman')).toBeVisible();

  // B finds the clan by name and asks to join.
  const otherContext = await browser.newContext();
  const other = await otherContext.newPage();
  await signUp(other, 'Bob Joiner');
  await openClanTab(other);
  await other.getByRole('searchbox', { name: 'Search clans' }).fill(clanName);
  await other.getByRole('link', { name: clanName }).click();
  await expect(other.getByRole('heading', { name: clanName, level: 1 })).toBeVisible();
  await expect(other.getByRole('tab', { name: 'Feed' })).toHaveCount(0);
  await other.getByRole('button', { name: 'Request to join' }).click();
  await expect(
    other.getByText('Your request to join is waiting for the Toastmeister or a Vice-Toast.'),
  ).toBeVisible();

  // A approves.
  await page.reload();
  const requests = page.getByRole('region', { name: 'Join requests' });
  await requests.getByRole('button', { name: 'Approve Bob Joiner' }).click();
  await expect(requests.getByText('No one is waiting to join.')).toBeVisible();
  await page.getByRole('tab', { name: 'Members' }).click();
  await expect(page.getByRole('link', { name: 'Bob Joiner' })).toBeVisible();

  // B is in: the feed shows A's session, and B likes it.
  await other.reload();
  await expect(other.getByRole('tab', { name: 'Feed' })).toHaveAttribute('aria-selected', 'true');
  const session = other.getByRole('listitem').filter({ hasText: 'Ann Founder' });
  await expect(session).toContainText('1 toast');
  await session.getByRole('button', { name: 'Like (0)' }).click();
  await expect(session.getByRole('button', { name: 'Like (1)' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  // The Clan tab now leads straight to B's clan.
  await other.goto('/home');
  await openClanTab(other);
  await expect(other.getByRole('heading', { name: clanName, level: 1 })).toBeVisible();

  // The like survives a reload, so it was saved.
  await other.reload();
  await expect(
    other.getByRole('listitem').filter({ hasText: 'Ann Founder' }).getByRole('button', {
      name: 'Like (1)',
    }),
  ).toBeVisible();

  await otherContext.close();
});
