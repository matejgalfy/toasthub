import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { AppError } from './errors/app-error';
import { decodeCursor, encodeCursor, toPage } from './pagination';

const keyset = z.object({ createdAt: z.iso.datetime(), id: z.uuid() });
const row = (n: number) => ({ id: `0190a0b0-0000-7000-8000-00000000000${String(n)}`, n });

describe('cursor encoding', () => {
  it('round-trips a keyset', () => {
    const value = { createdAt: '2026-10-29T10:00:00.000Z', id: row(1).id };
    expect(decodeCursor(encodeCursor(value), keyset)).toEqual(value);
  });

  it.each([
    ['not base64 JSON', 'nope!'],
    ['valid JSON, wrong shape', encodeCursor({ id: 42 })],
  ])('rejects a cursor that is %s', (_, cursor) => {
    expect(() => decodeCursor(cursor, keyset)).toThrow(AppError);
    try {
      decodeCursor(cursor, keyset);
    } catch (error) {
      expect(error).toMatchObject({
        code: 'VALIDATION_ERROR',
        fields: { cursor: 'Invalid cursor' },
      });
    }
  });
});

describe('toPage', () => {
  const keysetOf = (r: { id: string }) => ({ id: r.id });

  it('has no next cursor when the extra row is missing', () => {
    const rows = [row(1), row(2)];
    expect(toPage(rows, 2, keysetOf)).toEqual({ items: rows, nextCursor: null });
  });

  it('drops the extra row and points the cursor at the last returned row', () => {
    const page = toPage([row(1), row(2), row(3)], 2, keysetOf);
    expect(page.items).toEqual([row(1), row(2)]);
    expect(page.nextCursor).toBe(encodeCursor({ id: row(2).id }));
  });

  it('handles an empty result', () => {
    expect(toPage([], 20, keysetOf)).toEqual({ items: [], nextCursor: null });
  });
});
