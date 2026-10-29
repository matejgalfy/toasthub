import type { Database } from '../src/db/db.module';
import { toast, toastSession } from '../src/db/schema';

type ToastInsert = Omit<typeof toast.$inferInsert, 'sessionId'>;

/**
 * Inserts toasts directly, for data the API can't create (past days, rejected toasts). Each one gets its own
 * session, logged when the toast was eaten, like the migration that introduced sessions.
 */
export async function insertToasts(
  db: Database,
  rows: ToastInsert[],
): Promise<(typeof toast.$inferSelect)[]> {
  if (rows.length === 0) return [];
  const sessions = await db
    .insert(toastSession)
    .values(
      rows.map((row) => ({
        userId: row.userId,
        createdAt: row.eatenAt ?? new Date(),
        deletedAt: row.deletedAt ?? null,
      })),
    )
    .returning({ id: toastSession.id });
  return db
    .insert(toast)
    .values(
      rows.map((row, i) => {
        const session = sessions[i];
        if (!session) throw new Error('Toast session insert returned too few rows');
        return { ...row, sessionId: session.id };
      }),
    )
    .returning();
}
