import { describe, expect, it } from 'vitest';

import { reportToastSchema } from './flag.js';

describe('reportToastSchema', () => {
  it('accepts a missing body as no reason', () => {
    expect(reportToastSchema.parse(undefined)).toEqual({});
    expect(reportToastSchema.parse(null)).toEqual({});
  });

  it('trims the reason and allows up to 280 chars', () => {
    expect(reportToastSchema.parse({ reason: '  spam ' })).toEqual({ reason: 'spam' });
    expect(reportToastSchema.safeParse({ reason: 'x'.repeat(280) }).success).toBe(true);
    expect(reportToastSchema.safeParse({ reason: 'x'.repeat(281) }).success).toBe(false);
  });

  it('rejects unknown fields', () => {
    expect(reportToastSchema.safeParse({ reasn: 'spam' }).success).toBe(false);
  });
});
