import { count, inArray, sql } from 'drizzle-orm';

import type { DbExecutor } from '../../db/db.module';
import { like } from '../../db/schema';

export interface LikeStats {
  likeCount: number;
  likedByMe: boolean;
}

const NO_LIKES: LikeStats = { likeCount: 0, likedByMe: false };

/** 🍞 likes on each of the given lead toasts, and whether the viewer gave one (SPEC §4.9). */
export async function likeStats(
  db: DbExecutor,
  viewerId: string,
  toastIds: string[],
): Promise<(toastId: string) => LikeStats> {
  if (toastIds.length === 0) return () => NO_LIKES;
  const rows = await db
    .select({
      toastId: like.toastId,
      likeCount: count(),
      likedByMe: sql<boolean>`bool_or(${like.userId} = ${viewerId})`,
    })
    .from(like)
    .where(inArray(like.toastId, toastIds))
    .groupBy(like.toastId);
  const byToast = new Map(rows.map(({ toastId, ...stats }) => [toastId, stats]));
  return (toastId) => byToast.get(toastId) ?? NO_LIKES;
}
