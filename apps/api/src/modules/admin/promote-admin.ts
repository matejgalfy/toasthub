import { UserRole } from '@toasthub/shared';
import { eq } from 'drizzle-orm';
import { Pool } from 'pg';

import { parseEnv } from '../../config/env';
import { createDatabase, type Database } from '../../db/db.module';
import { user } from '../../db/schema';

/*
 * Makes an existing user an admin, which no route can do (bootstrapping the first admin):
 * `bun run --filter @toasthub/api admin:promote <email>` locally, or
 * `node dist/modules/admin/promote-admin.js <email>` in a running api container. The user must have
 * signed in once. The role applies from their next request, since sessions read the user fresh.
 */

/** Sets the role of the user with this email (case-insensitive); false when there is none. */
export async function promoteToAdmin(db: Database, email: string): Promise<boolean> {
  const rows = await db
    .update(user)
    .set({ role: UserRole.admin })
    .where(eq(user.email, email.trim()))
    .returning({ id: user.id });
  return rows.length > 0;
}

if (require.main === module) {
  const email = process.argv[2] ?? '';
  if (email === '') {
    console.error('Usage: admin:promote <email>');
    process.exit(1);
  }
  const pool = new Pool({ connectionString: parseEnv(process.env).DATABASE_URL, max: 1 });
  promoteToAdmin(createDatabase(pool), email)
    .then(
      (found) => {
        if (found) console.log('The user is now an admin');
        else {
          console.error('No user with this email: they must sign in once first');
          process.exitCode = 1;
        }
      },
      (error: unknown) => {
        console.error(error);
        process.exitCode = 1;
      },
    )
    .finally(() => void pool.end());
}
