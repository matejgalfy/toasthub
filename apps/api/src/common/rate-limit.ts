import { eq, sql } from 'drizzle-orm';

import type { DbExecutor } from '../db/db.module';
import { rateLimit } from '../db/schema/auth';

export interface RateLimitRule {
  /** Seconds. */
  window: number;
  max: number;
}

export type RateLimitResult = { allowed: true } | { allowed: false; retryAfter: number };

/**
 * Takes `cost` hits for `key` in a fixed window that starts at the key's first hit, all or none: a
 * refused request records nothing, so retrying while limited doesn't use up the next window. A single
 * upsert locks the row, so concurrent requests on any api replica can't all read a stale count (SPEC §14
 * Q4). Rows live in Better Auth's `rate_limit` table, next to its per-IP limits; keys carry a prefix.
 */
export async function consumeRateLimit(
  db: DbExecutor,
  key: string,
  rule: RateLimitRule,
  { cost = 1, now = Date.now() }: { cost?: number; now?: number } = {},
): Promise<RateLimitResult> {
  const windowMs = rule.window * 1000;
  if (cost > rule.max) return { allowed: false, retryAfter: rule.window };

  const expired = sql`${rateLimit.lastRequest} <= ${now - windowMs}`;
  const [taken] = await db
    .insert(rateLimit)
    .values({ key, count: cost, lastRequest: now })
    .onConflictDoUpdate({
      target: rateLimit.key,
      set: {
        count: sql`CASE WHEN ${expired} THEN ${cost} ELSE ${rateLimit.count} + ${cost} END`,
        lastRequest: sql`CASE WHEN ${expired} THEN ${now} ELSE ${rateLimit.lastRequest} END`,
      },
      setWhere: sql`${expired} OR ${rateLimit.count} + ${cost} <= ${rule.max}`,
    })
    .returning({ count: rateLimit.count });
  if (taken) return { allowed: true };

  const [current] = await db
    .select({ windowStart: rateLimit.lastRequest })
    .from(rateLimit)
    .where(eq(rateLimit.key, key));
  const windowEnd = (current?.windowStart ?? now) + windowMs;
  return { allowed: false, retryAfter: Math.max(1, Math.ceil((windowEnd - now) / 1000)) };
}
