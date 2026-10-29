import { describe, expect, it } from 'vitest';

import { healthSchema } from './health.js';

describe('healthSchema', () => {
  it('accepts an ok status', () => {
    expect(healthSchema.parse({ status: 'ok' })).toEqual({ status: 'ok' });
  });

  it('rejects any other status', () => {
    expect(healthSchema.safeParse({ status: 'down' }).success).toBe(false);
  });
});
