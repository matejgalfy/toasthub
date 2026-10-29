import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { pageQuerySchema, pageSchema } from './pagination.js';

describe('pageQuerySchema', () => {
  it('defaults to the first page of 20', () => {
    expect(pageQuerySchema.parse({})).toEqual({ limit: 20 });
  });

  it('treats blank query values as missing', () => {
    expect(pageQuerySchema.parse({ cursor: '', limit: '' })).toEqual({ limit: 20 });
  });

  it('coerces the limit from a query string', () => {
    expect(pageQuerySchema.parse({ cursor: 'abc', limit: '50' })).toEqual({
      cursor: 'abc',
      limit: 50,
    });
  });

  it.each(['0', '51', '2.5', 'ten'])('rejects limit=%s', (limit) => {
    expect(pageQuerySchema.safeParse({ limit }).success).toBe(false);
  });
});

describe('pageSchema', () => {
  it('describes items and a nullable cursor', () => {
    const schema = pageSchema(z.object({ id: z.string() }));
    expect(schema.parse({ items: [{ id: 'a' }], nextCursor: null })).toEqual({
      items: [{ id: 'a' }],
      nextCursor: null,
    });
    expect(schema.safeParse({ items: [] }).success).toBe(false);
  });
});
