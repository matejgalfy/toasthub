import { expect, test } from '@playwright/test';

import { signUp } from '../support/auth.js';
import { execute } from '../support/db.js';
import { logToasts } from '../support/toasts.js';

// Last week's Monday in Europe/Bratislava, the week the home card shows.
const LAST_WEEK = `date_trunc('week', now() AT TIME ZONE 'Europe/Bratislava')::date - 7`;

test("last week's winner shows on home", async ({ page }) => {
  const name = `Winner ${String(Date.now())}`;
  const email = await signUp(page, name);

  await logToasts(page);

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
});
