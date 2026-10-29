import { MAILPIT_URL } from './env.js';

// Mailpit's REST API (https://mailpit.axllent.org/docs/api-v1/), like apps/api/test/mailpit.ts.

interface SearchResult {
  messages: { ID: string }[];
}

async function get<T>(path: string): Promise<T> {
  const response = await fetch(`${MAILPIT_URL}/api/v1${path}`);
  if (!response.ok) throw new Error(`Mailpit ${path}: HTTP ${String(response.status)}`);
  return (await response.json()) as T;
}

/**
 * The magic link in the newest email to `email`, once at least `count` emails have arrived (so a resend
 * isn't answered with the old link). Mail is delivered asynchronously, so this polls.
 */
export async function magicLinkFor(
  email: string,
  { count = 1, timeoutMs = 10_000 } = {},
): Promise<string> {
  const query = encodeURIComponent(`to:"${email}"`);
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const { messages } = await get<SearchResult>(`/search?query=${query}`);
    const [newest] = messages;
    if (newest && messages.length >= count) {
      const { Text } = await get<{ Text: string }>(`/message/${newest.ID}`);
      const match = /https?:\/\/\S+\/magic-link\/verify\?\S+/.exec(Text);
      if (!match) throw new Error(`No magic link in the email to ${email}`);
      return match[0];
    }
    if (Date.now() > deadline) {
      throw new Error(
        `Expected ${String(count)} email(s) to ${email} within ${String(timeoutMs)} ms`,
      );
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
}

/** A fresh address per test, so tests share the database without seeing each other's users. */
export function uniqueEmail(): string {
  const suffix = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  return `e2e-${suffix}@example.com`;
}
