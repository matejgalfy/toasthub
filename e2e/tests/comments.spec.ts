import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

import { signUp } from '../support/auth.js';
import { logToasts } from '../support/toasts.js';

test('nested comments are shared with profile photos and survive parent deletion', async ({
  page,
}) => {
  const name = `Thread ${Math.random().toString(36).slice(2, 10)}`;
  await signUp(page, name);
  await logToasts(page);
  const feed = page.getByRole('region', { name: 'Toasts from everyone' });
  const session = feed.getByRole('listitem').filter({ hasText: name }).first();
  await session.getByRole('textbox', { name: 'Comment', exact: true }).fill('A tasty toast');
  await session.getByRole('button', { name: 'Post comment', exact: true }).click();
  const root = session.getByRole('listitem').filter({ hasText: 'A tasty toast' });
  await expect(root).toBeVisible();
  await root.getByRole('button', { name: 'Like 0', exact: true }).click();
  await expect(root.getByRole('button', { name: 'Like 1', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await root.getByRole('button', { name: 'Like 1', exact: true }).click();
  await expect(root.getByRole('button', { name: 'Like 0', exact: true })).toHaveAttribute(
    'aria-pressed',
    'false',
  );
  await root.getByRole('button', { name: `Reply to ${name}`, exact: true }).click();
  await session.getByRole('textbox', { name: 'Reply', exact: true }).fill('With cheese');
  await session.getByRole('button', { name: 'Post reply', exact: true }).click();
  const reply = session.getByRole('listitem').filter({ hasText: 'With cheese' });
  await expect(
    session.getByRole('button', { name: 'Show all comments', exact: true }),
  ).toBeVisible();
  await expect(reply).toBeVisible();
  await session.getByRole('button', { name: 'Show all comments', exact: true }).click();
  await expect(reply).toBeVisible();
  await reply.getByRole('button', { name: `Reply to ${name}`, exact: true }).click();
  await session.getByRole('textbox', { name: 'Reply', exact: true }).fill('And tomatoes');
  await session.getByRole('button', { name: 'Post reply', exact: true }).click();
  await expect(session.getByText('And tomatoes', { exact: true })).toBeVisible();
  await root.getByRole('button', { name: `Hide replies to ${name}`, exact: true }).click();
  await expect(root).toBeVisible();
  await expect(session.getByText('With cheese', { exact: true })).toHaveCount(0);
  await expect(session.getByText('And tomatoes', { exact: true })).toHaveCount(0);
  await root.getByRole('button', { name: `Show replies to ${name}`, exact: true }).click();
  await expect(session.getByText('With cheese', { exact: true })).toBeVisible();
  await expect(session.getByText('And tomatoes', { exact: true })).toBeVisible();
  await session.getByRole('textbox', { name: 'Comment', exact: true }).fill('A fourth comment');
  await session.getByRole('button', { name: 'Post comment', exact: true }).click();
  await expect(session.getByText('A fourth comment', { exact: true })).toBeVisible();

  await page.getByRole('link', { name: 'Profile', exact: true }).click();
  await page.getByRole('button', { name: /^Open photo and comments:/ }).click();
  const dialog = page.getByRole('dialog', { name: 'Photo and comments' });
  await expect(dialog.getByText('A tasty toast', { exact: true })).toBeVisible();
  await dialog.getByRole('button', { name: 'Show all comments', exact: true }).click();
  await expect(dialog.getByText('With cheese', { exact: true })).toBeVisible();
  await expect(dialog.getByText('And tomatoes', { exact: true })).toBeVisible();
  for (const colorScheme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme });
    const { violations } = await new AxeBuilder({ page })
      .include('[role="dialog"]')
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();
    expect(violations.map((violation) => violation.id)).toEqual([]);
  }
  await dialog
    .getByRole('listitem')
    .filter({ hasText: 'A tasty toast' })
    .getByRole('button', { name: `Delete comment by ${name}`, exact: true })
    .click();
  const confirmation = page.getByRole('dialog', { name: 'Delete this comment?' });
  await expect(confirmation).toBeVisible();
  await confirmation.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(dialog.getByText('A tasty toast', { exact: true })).toBeVisible();
  await dialog
    .getByRole('listitem')
    .filter({ hasText: 'A tasty toast' })
    .getByRole('button', { name: `Delete comment by ${name}`, exact: true })
    .click();
  await confirmation.getByRole('button', { name: 'Delete', exact: true }).click();
  await expect(dialog.getByText('A tasty toast', { exact: true })).toHaveCount(0);
  await expect(dialog.getByText('Deleted comment', { exact: true }).first()).toBeVisible();
  await expect(dialog.getByText('With cheese', { exact: true })).toBeVisible();
  await expect(dialog.getByText('And tomatoes', { exact: true })).toBeVisible();
  await page.reload();
  await page.getByRole('button', { name: /^Open photo and comments:/ }).click();
  await expect(dialog.getByText('A tasty toast', { exact: true })).toHaveCount(0);
  await dialog.getByRole('button', { name: 'Show all comments', exact: true }).click();
  await expect(dialog.getByText('And tomatoes', { exact: true })).toBeVisible();
});
