import { createHash } from 'node:crypto';

/** Hashed, so the rate-limit table doesn't become a second list of emails. */
export function emailRateLimitKey(email: string): string {
  const digest = createHash('sha256').update(email.trim().toLowerCase()).digest('hex');
  return `magic-link-email:${digest}`;
}
