import { inject } from 'vitest';

// Mailpit's REST API (https://mailpit.axllent.org/docs/api-v1/), against the test run's container.

interface MessageSummary {
  ID: string;
}

export interface Message {
  Subject: string;
  Text: string;
  HTML: string;
  To: { Address: string }[];
}

function api(path: string, init?: RequestInit): Promise<Response> {
  return fetch(`${inject('mailpitUrl')}/api/v1${path}`, init);
}

export async function clearMailbox(): Promise<void> {
  await api('/messages', { method: 'DELETE' });
}

/** Messages sent to `email`, newest first. */
export async function messagesTo(email: string): Promise<Message[]> {
  const query = encodeURIComponent(`to:"${email}"`);
  const { messages } = (await (await api(`/search?query=${query}`)).json()) as {
    messages: MessageSummary[];
  };
  return Promise.all(
    messages.map(async ({ ID }) => (await (await api(`/message/${ID}`)).json()) as Message),
  );
}

/** The newest message to `email`. Mailpit stores mail right after SMTP accepts it; this allows for that. */
export async function latestMessageTo(email: string, timeoutMs = 3_000): Promise<Message> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const [latest] = await messagesTo(email);
    if (latest) return latest;
    if (Date.now() > deadline)
      throw new Error(`No email to ${email} within ${String(timeoutMs)} ms`);
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
}

/** The magic link in the newest message to `email`. */
export async function magicLinkFor(email: string): Promise<URL> {
  const { Text } = await latestMessageTo(email);
  const match = /https?:\/\/\S+\/magic-link\/verify\?\S+/.exec(Text);
  if (!match) throw new Error(`No magic link in the email to ${email}`);
  return new URL(match[0]);
}
