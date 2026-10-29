import { ToastStatus, UserStatus } from '@toasthub/shared';
import { type SQL, sql } from 'drizzle-orm';

import { toast, user } from '../../db/schema';

/**
 * The `WHERE` condition for toasts that count: not deleted, not rejected by an admin, and logged by a user
 * who isn't banned. Every count, streak, stat, leaderboard and achievement filters `toast` with it.
 */
export function countableToasts(): SQL {
  return sql`(${toast.deletedAt} IS NULL AND ${toast.status} = ${ToastStatus.active} AND EXISTS (
    SELECT 1 FROM ${user} WHERE ${user.id} = ${toast.userId} AND ${user.status} = ${UserStatus.active}
  ))`;
}
