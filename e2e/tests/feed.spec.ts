import { expect, test } from '@playwright/test';

import { signUp } from '../support/auth.js';
import { logToasts } from '../support/toasts.js';

/** The database isn't reset between runs, so each poster gets a name of its own. */
function uniqueName(): string {
  return `Feed ${Math.random().toString(36).slice(2, 10)}`;
}

test('the global feed on home shows anyone’s toasts, likes them, and the arrow leads to it', async ({
  page,
  browser,
}) => {
  // A logs a toast; A is in no clan, and every profile is public (SPEC §4.14, D67).
  const poster = uniqueName();
  await signUp(page, poster);
  await logToasts(page);
  const feed = page.getByRole('region', { name: 'Toasts from everyone' });
  await expect(feed.getByRole('listitem').filter({ hasText: poster })).toContainText('1 toast');

  // B, another user, sees it on their home and likes it.
  const otherContext = await browser.newContext();
  const other = await otherContext.newPage();
  // Short enough that the feed starts below the screen.
  await other.setViewportSize({ width: 412, height: 480 });
  await signUp(other, uniqueName());
  const jump = other.getByRole('button', { name: 'Scroll to the toasts from everyone' });
  await expect(jump).toBeVisible();
  await jump.click();
  const otherFeed = other.getByRole('region', { name: 'Toasts from everyone' });
  await expect(otherFeed.getByRole('heading', { name: 'Toasts from everyone' })).toBeInViewport();
  await expect(jump).toBeHidden();

  const session = otherFeed.getByRole('listitem').filter({ hasText: poster });
  await expect(session.getByRole('img', { name: new RegExp(`^${poster}'s photo`) })).toBeVisible();
  await session.getByRole('button', { name: 'Like 0' }).click();
  await expect(session.getByRole('button', { name: 'Like 1' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );

  // Saved: A sees the like on their own home after a reload.
  await page.reload();
  await expect(
    feed.getByRole('listitem').filter({ hasText: poster }).getByRole('button', { name: 'Like 1' }),
  ).toBeVisible();

  await otherContext.close();
});
