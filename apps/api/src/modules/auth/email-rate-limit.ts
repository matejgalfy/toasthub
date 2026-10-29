import { createHash } from 'node:crypto';

import { sql } from 'drizzle-orm';

import type { Database } from '../../db/db.module';
import { rateLimit } from '../../db/schema/auth';

export interface RateLimitRule {
  /** Seconds. */
  window: number;
  max: number;
}

export type RateLimitResult = { allowed: true } | { allowed: false; retryAfter: number };

/** Hashed, so the rate-limit table doesn't become a second list of emails. */
export function emailRateLimitKey(email: string): string {
  const digest = createHash('sha256').update(email.trim().toLowerCase()).digest('hex');
  return `magic-link-email:${digest}`;
}

/**
 * Counts one request against `key` in a fixed window that starts at the first request. A single upsert,
 * so concurrent requests can't all read a stale count. Rows live in Better Auth's `rate_limit` table,
 * which also prunes them once they are older than the longest window.
 */
export async function consumeRateLimit(
  db: Database,
  key: string,
  rule: RateLimitRule,
  now = Date.now(),
): Promise<RateLimitResult> {
  const windowMs = rule.window * 1000;
  const expired = sql`${rateLimit.lastRequest} <= ${now - windowMs}`;
  const [row] = await db
    .insert(rateLimit)
    .values({ key, count: 1, lastRequest: now })
    .onConflictDoUpdate({
      target: rateLimit.key,
      set: {
        count: sql`CASE WHEN ${expired} THEN 1 ELSE ${rateLimit.count} + 1 END`,
        lastRequest: sql`CASE WHEN ${expired} THEN ${now} ELSE ${rateLimit.lastRequest} END`,
      },
    })
    .returning({ count: rateLimit.count, windowStart: rateLimit.lastRequest });

  if (!row || row.count <= rule.max) return { allowed: true };
  return { allowed: false, retryAfter: Math.ceil((row.windowStart + windowMs - now) / 1000) };
}
