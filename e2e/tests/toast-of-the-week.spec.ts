import { fileURLToPath } from 'node:url';

import { expect, test } from '@playwright/test';

import { signUp } from '../support/auth.js';
import { execute } from '../support/db.js';

const PHOTO = fileURLToPath(new URL('../fixtures/toast.jpg', import.meta.url));

// Last week's Monday in Europe/Bratislava, the week the home card shows.
const LAST_WEEK = `date_trunc('week', now() AT TIME ZONE 'Europe/Bratislava')::date - 7`;

test("last week's winner shows on home and in the history", async ({ page }) => {
  const name = `Winner ${String(Date.now())}`;
  const email = await signUp(page, name);

  const dialog = page.getByRole('dialog', { name: 'Log toasts' });
  await page.getByRole('button', { name: 'Toast', exact: true }).click();
  const chooser = page.waitForEvent('filechooser');
  await dialog.getByRole('button', { name: 'Add a photo' }).click();
  await (await chooser).setFiles(PHOTO);
  await dialog.getByRole('button', { name: 'Log 1 toast' }).click();
  await expect(dialog).toBeHidden();

  // The draw only takes toasts of a week that has ended, which the UI can't log (no backdating): move
  // the photo toast to last Wednesday and make it last week's winner, as the Monday job would. Other
  // runs share the dev database, so this replaces whichever winner the week had.
  await execute(`
    WITH moved AS (
      UPDATE toast SET eaten_at = ((${LAST_WEEK}) + 2 + time '12:00') AT TIME ZONE 'Europe/Bratislava'
      WHERE user_id = (SELECT id FROM "user" WHERE email = '${email}') AND photo_key IS NOT NULL
      RETURNING id
    )
    INSERT INTO toast_of_the_week (week_start, toast_id)
    SELECT ${LAST_WEEK}, id FROM moved
    ON CONFLICT (week_start) DO UPDATE
      SET toast_id = EXCLUDED.toast_id, drawn_at = now(), drawn_by = NULL
  `);

  await page.reload();
  await expect(page.getByRole('img', { name: `Toast of the week by ${name}` })).toBeVisible();
  await expect(page.getByRole('link', { name, exact: true })).toBeVisible();

  await page.getByRole('link', { name: 'All winners' }).click();
  await expect(page.getByRole('heading', { name: 'Toast of the week', level: 1 })).toBeVisible();
  const newest = page.getByRole('listitem').first();
  await expect(newest.getByRole('img', { name: `Toast of the week by ${name}` })).toBeVisible();
});
