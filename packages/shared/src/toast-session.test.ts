import { describe, expect, it } from 'vitest';

import { createToastSessionSchema, updateToastSessionSchema } from './toast-session.js';

describe('createToastSessionSchema', () => {
  it('defaults to one toast', () => {
    expect(createToastSessionSchema.parse({})).toEqual({ count: 1 });
  });

  it('reads the count from a multipart text field', () => {
    expect(createToastSessionSchema.parse({ count: '10' })).toEqual({ count: 10 });
  });

  it.each(['0', '11', '2.5', 'two', ''])('rejects count=%j', (count) => {
    expect(createToastSessionSchema.safeParse({ count }).success).toBe(false);
  });
});

describe('updateToastSessionSchema', () => {
  it('takes a JSON number from 1 to 10', () => {
    expect(updateToastSessionSchema.parse({ count: 3 })).toEqual({ count: 3 });
    expect(updateToastSessionSchema.safeParse({ count: '3' }).success).toBe(false);
    expect(updateToastSessionSchema.safeParse({ count: 0 }).success).toBe(false);
    expect(updateToastSessionSchema.safeParse({}).success).toBe(false);
  });
});
