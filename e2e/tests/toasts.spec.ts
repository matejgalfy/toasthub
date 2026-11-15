import { expect, test, type Page } from '@playwright/test';

import { signUp } from '../support/auth.js';
import { execute } from '../support/db.js';
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

async function findFeedPost(page: Page, name: string) {
  const feed = page.getByRole('region', { name: 'Toasts from everyone' });
  const rows = feed.locator('ul').first().locator(':scope > li');
  await expect(rows.first()).toBeVisible();
  const post = feed.getByRole('listitem').filter({ hasText: name });
  while ((await post.count()) === 0) {
    const before = await rows.count();
    const more = page.getByRole('button', { name: 'Show older toasts', exact: true });
    await expect(more).toBeVisible();
    // Avoid scrolling into the automatic loader while also testing the explicit button path.
    await more.dispatchEvent('click');
    await expect.poll(() => rows.count()).toBeGreaterThan(before);
  }
  return post;
}

test('an optional description is saved, shown, edited and cleared', async ({ page }) => {
  const poster = `Caption ${Math.random().toString(36).slice(2, 10)}`;
  const description = 'Breakfast with cheese\nand tomatoes';
  await page.setViewportSize({ width: 360, height: 640 });
  await signUp(page, poster);
  await page.getByRole('button', { name: 'Toast', exact: true }).click();
  const log = page.getByRole('dialog', { name: 'Log toasts' });
  const field = log.getByLabel('Description (optional)');
  await expect(field).toHaveAttribute('maxlength', '500');
  await field.fill(`  ${description}  `);
  await pickPhoto(page, log);
  const dialogBox = await log.boundingBox();
  expect(dialogBox?.height).toBeLessThanOrEqual(640 * 0.9);
  await log.getByRole('button', { name: 'Log 1 toast' }).click();
  await expect(log).toBeHidden();

  const feed = page.getByRole('region', { name: 'Toasts from everyone' });
  const post = feed.getByRole('listitem').filter({ hasText: poster });
  await expect(post).toContainText(description);
  await page.reload();
  await expect(post).toContainText(description);

  await page.getByRole('link', { name: 'Profile', exact: true }).click();
  await page.getByRole('button', { name: /^Open photo and comments:/ }).click();
  const photo = page.getByRole('dialog', { name: 'Photo and comments' });
  await expect(photo).toContainText(description);
  await photo.getByRole('button', { name: 'Close', exact: true }).click();
  await page.getByRole('link', { name: 'My toasts' }).click();

  const today = page.getByRole('region', { name: 'Today' });
  await expect(today).toContainText(description);
  await today.getByRole('button', { name: /1 toast/ }).click();
  const edit = page.getByRole('dialog', { name: 'Edit toasts' });
  await expect(edit.getByLabel('Description (optional)')).toHaveValue(description);
  await edit.getByLabel('Description (optional)').fill('Late breakfast');
  await edit.getByRole('button', { name: 'Save changes' }).click();
  await expect(edit).toBeHidden();
  await expect(today).toContainText('Late breakfast');
  await goHome(page);
  await expect(post).toContainText('Late breakfast');
  await expect(post).not.toContainText(description);

  await goToMyToasts(page);
  await today.getByRole('button', { name: /1 toast/ }).click();
  await edit.getByLabel('Description (optional)').fill('');
  await edit.getByRole('button', { name: 'Save changes' }).click();
  await expect(edit).toBeHidden();
  await expect(today).not.toContainText('Late breakfast');
  await goHome(page);
  await page.reload();
  await expect(post).toContainText('1 toast');
  await expect(post).not.toContainText('Late breakfast');
});

test('only the owner edits and clears an older post description from the feed', async ({
  page,
  browser,
}) => {
  const poster = `Owner ${Math.random().toString(36).slice(2, 10)}`;
  await page.setViewportSize({ width: 360, height: 640 });
  const email = await signUp(page, poster);
  await logToasts(page, 2);
  // Only this test user's rows move to the previous day, without waiting for midnight.
  await execute(`UPDATE toast_session SET created_at = now() - interval '1 day'
    WHERE user_id IN (SELECT id FROM "user" WHERE email = '${email}')`);
  await execute(`UPDATE toast SET eaten_at = now() - interval '1 day'
    WHERE user_id IN (SELECT id FROM "user" WHERE email = '${email}')`);
  await page.reload();

  let post = await findFeedPost(page, poster);
  await post.getByRole('button', { name: 'Edit description', exact: true }).click();
  const edit = page.getByRole('dialog', { name: 'Edit description', exact: true });
  await expect(edit.getByLabel('Description (optional)')).toHaveValue('');
  await edit.getByLabel('Description (optional)').fill('An updated older post');
  const patch = page.waitForRequest(
    (request) => request.method() === 'PATCH' && request.url().includes('/api/v1/toast-sessions/'),
  );
  await edit.getByRole('button', { name: 'Save changes', exact: true }).click();
  expect((await patch).postDataJSON()).toEqual({ description: 'An updated older post' });
  await expect(edit).toBeHidden();
  await expect(post).toContainText('An updated older post');
  await expect(post).toContainText('2 toasts');
  await page.reload();
  post = await findFeedPost(page, poster);
  await expect(post).toContainText('An updated older post');

  const otherContext = await browser.newContext();
  const other = await otherContext.newPage();
  await signUp(other, `Viewer ${Math.random().toString(36).slice(2, 10)}`);
  const otherPost = await findFeedPost(other, poster);
  await expect(otherPost).toContainText('An updated older post');
  await expect(
    otherPost.getByRole('button', { name: 'Edit description', exact: true }),
  ).toHaveCount(0);
  await otherContext.close();

  await post.getByRole('button', { name: 'Edit description', exact: true }).click();
  await edit.getByLabel('Description (optional)').fill('');
  await edit.getByRole('button', { name: 'Save changes', exact: true }).click();
  await expect(edit).toBeHidden();
  await page.reload();
  post = await findFeedPost(page, poster);
  await expect(post).not.toContainText('An updated older post');
  await expect(post.getByRole('button', { name: 'Edit description', exact: true })).toBeVisible();
  await expect(post).toContainText('2 toasts');
  await goToMyToasts(page);
  await expect(page.getByRole('button', { name: /2 toasts/ })).toHaveCount(0);
});

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
