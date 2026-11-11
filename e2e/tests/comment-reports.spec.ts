import { expect, test } from '@playwright/test';

import { signUp } from '../support/auth.js';
import { execute } from '../support/db.js';
import { logToasts } from '../support/toasts.js';

test('comment reports stay visible until an admin deletes the comment, preserving replies', async ({
  page,
  browser,
}) => {
  const name = `Reported ${Math.random().toString(36).slice(2, 10)}`;
  await signUp(page, name);
  await logToasts(page);
  const feed = page.getByRole('region', { name: 'Toasts from everyone' });
  const session = feed.getByRole('listitem').filter({ hasText: name }).first();
  await session
    .getByRole('textbox', { name: 'Comment', exact: true })
    .fill('Please review this comment');
  await session.getByRole('button', { name: 'Post comment', exact: true }).click();
  const root = session.getByRole('listitem').filter({ hasText: 'Please review this comment' });
  await root.getByRole('button', { name: `Reply to ${name}`, exact: true }).click();
  await session
    .getByRole('textbox', { name: 'Reply', exact: true })
    .fill('This reply should remain');
  await session.getByRole('button', { name: 'Post reply', exact: true }).click();
  await expect(session.getByText('This reply should remain', { exact: true })).toBeVisible();

  const adminContext = await browser.newContext();
  const admin = await adminContext.newPage();
  const adminEmail = await signUp(admin, `Reviewer ${Math.random().toString(36).slice(2, 8)}`);
  const adminFeed = admin.getByRole('region', { name: 'Toasts from everyone' });
  const reportedSession = adminFeed.getByRole('listitem').filter({ hasText: name }).first();
  await reportedSession
    .getByRole('listitem')
    .filter({ hasText: 'Please review this comment' })
    .getByRole('button', { name: `Report comment by ${name}`, exact: true })
    .click();
  const report = admin.getByRole('dialog', { name: 'Report this comment?' });
  await report
    .getByRole('textbox', { name: 'Reason (optional)' })
    .fill('Please review the wording');
  await report.getByRole('button', { name: 'Send report', exact: true }).click();
  await expect(report).toBeHidden();
  await expect(
    reportedSession.getByText('Please review this comment', { exact: true }),
  ).toBeVisible();

  await execute(`UPDATE "user" SET role = 'admin' WHERE email = '${adminEmail}'`);
  await admin.reload();
  await admin.getByRole('link', { name: 'Admin', exact: true }).click();
  await admin.getByLabel('Type').selectOption('comment_report');
  const flag = admin
    .getByRole('list', { name: 'Flags' })
    .getByRole('listitem')
    .filter({ hasText: name });
  await expect(flag).toContainText('Please review this comment');
  await expect(flag).toContainText('Please review the wording');
  await flag.getByRole('button', { name: `Resolve the flag on ${name}`, exact: true }).click();
  const resolve = admin.getByRole('dialog', { name: `Resolve the flag on ${name}` });
  await resolve.getByLabel('Delete the comment', { exact: true }).click();
  await resolve.getByRole('button', { name: 'Resolve', exact: true }).click();
  await expect(resolve).toBeHidden();
  await expect(flag).toHaveCount(0);

  await page.reload();
  await expect(session.getByText('Please review this comment', { exact: true })).toHaveCount(0);
  await expect(session.getByText('Deleted comment', { exact: true }).first()).toBeVisible();
  await expect(session.getByText('This reply should remain', { exact: true })).toBeVisible();
  await adminContext.close();
});
