import pg from 'pg';

/** Runs `query` on the dev database (`DATABASE_URL`, loaded from apps/api/.env by the global setup). */
export async function execute(query: string): Promise<void> {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error('DATABASE_URL is not set (see apps/api/.env.example)');
  const client = new pg.Client({ connectionString });
  await client.connect();
  try {
    await client.query(query);
  } finally {
    await client.end();
  }
}

/**
 * Better Auth's magic-link plugin allows 5 verifies per minute per IP, and every test comes from
 * 127.0.0.1, so a suite with more sign-ups than that would get 429s. Cleared before each verify.
 */
export function resetVerifyRateLimit(): Promise<void> {
  return execute(`DELETE FROM rate_limit WHERE key LIKE '%|/magic-link/verify'`);
}
