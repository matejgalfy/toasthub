import type { Page } from '@toasthub/shared';
import type { z } from 'zod';

import { AppError } from './errors/app-error';

// Cursors are opaque to clients: base64url-encoded JSON of the keyset of the last item on a page.

export function encodeCursor(keyset: unknown): string {
  return Buffer.from(JSON.stringify(keyset)).toString('base64url');
}

export function decodeCursor<T extends z.ZodType>(cursor: string, schema: T): z.infer<T> {
  let decoded: unknown;
  try {
    decoded = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
  } catch {
    throw invalidCursor();
  }
  const result = schema.safeParse(decoded);
  if (!result.success) throw invalidCursor();
  return result.data;
}

/**
 * Builds a page from rows fetched with `LIMIT limit + 1`: the extra row only tells us that another page
 * exists, and the cursor points at the last row that is returned.
 */
export function toPage<T>(rows: T[], limit: number, keysetOf: (row: T) => unknown): Page<T> {
  if (rows.length <= limit) return { items: rows, nextCursor: null };
  const items = rows.slice(0, limit);
  const last = items.at(-1);
  return { items, nextCursor: last === undefined ? null : encodeCursor(keysetOf(last)) };
}

function invalidCursor(): AppError {
  return new AppError('VALIDATION_ERROR', 'Request validation failed', {
    cursor: 'Invalid cursor',
  });
}
