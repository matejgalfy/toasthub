import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

import { signUp } from '../support/auth.js';
import { execute } from '../support/db.js';

// SPEC §10: WCAG 2.1 AA basics. axe finds what can be checked automatically (labels, names, contrast,
// landmarks, ARIA); keyboard use and alt text quality still need a person.
const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];

/** Opens `path`, waits until it has loaded its data, and fails on any axe violation. */
async function expectAccessible(page: Page, path: string) {
  await page.goto(path);
  await page.waitForLoadState('networkidle');
  await expect(page.getByRole('heading', { level: 1 }).first()).toBeAttached();
  const { violations } = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
  const summary = violations.map((violation) => ({
    rule: violation.id,
    help: violation.help,
    elements: violation.nodes.map((node) => node.html),
  }));
  expect.soft(summary, `axe violations on ${path}`).toEqual([]);
}

// Dark mode follows the system and has its own colours, so contrast is checked in both.
for (const colorScheme of ['light', 'dark'] as const) {
  test.describe(`${colorScheme} mode`, () => {
    test.use({ colorScheme });

    test('signed-out pages have no axe violations', async ({ page }) => {
      for (const path of ['/', '/login', '/no-such-page']) await expectAccessible(page, path);
    });

    test('the main pages have no axe violations', async ({ page }) => {
      // About 20 pages, each waiting for its data.
      test.setTimeout(120_000);
      const email = await signUp(page, 'Axe Toaster');
      const log = page.getByRole('dialog', { name: 'Log toasts' });
      await page.getByRole('button', { name: 'Toast', exact: true }).click();
      await expect(log).toBeVisible();
      const { violations } = await new AxeBuilder({ page })
        .include('[role="dialog"]')
        .withTags(WCAG_TAGS)
        .analyze();
      expect(violations.map((violation) => violation.id)).toEqual([]);
      await log.getByRole('button', { name: 'Log 1 toast' }).click();
      await expect(log).toBeHidden();

      await page.goto('/clans/new');
      await page
        .getByRole('textbox', { name: 'Name' })
        .fill(`Axe ${Math.random().toString(36).slice(2, 8)}`);
      await page.getByRole('button', { name: 'Create clan' }).click();
      await expect(page).toHaveURL(/\/clans\/[0-9a-f-]{36}$/);
      const clanPath = new URL(page.url()).pathname;

      await page.getByRole('link', { name: 'Profile', exact: true }).click();
      await expect(page).toHaveURL(/\/u\/[0-9a-f-]{36}$/);
      const profilePath = new URL(page.url()).pathname;

      for (const path of [
        '/home',
        '/toasts',
        '/leaderboards',
        '/clans',
        '/clans/new',
        clanPath,
        profilePath,
        '/settings',
      ]) {
        await expectAccessible(page, path);
      }

      await execute(`UPDATE "user" SET role = 'admin' WHERE email = '${email}'`);
      for (const tab of ['flags', 'users', 'clans', 'settings', 'metrics', 'totw']) {
        await expectAccessible(page, `/admin/${tab}`);
      }
    });
  });
}
