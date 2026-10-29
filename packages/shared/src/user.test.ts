import { describe, expect, it } from 'vitest';

import { updateMeSchema } from './user.js';

describe('updateMeSchema', () => {
  it('accepts an empty patch', () => {
    expect(updateMeSchema.parse({})).toEqual({});
  });

  it('trims the display name before checking its length', () => {
    expect(updateMeSchema.parse({ displayName: '  Jo  ' })).toEqual({ displayName: 'Jo' });
    expect(updateMeSchema.safeParse({ displayName: ' J ' }).success).toBe(false);
  });

  it.each([
    [1, false],
    [2, true],
    [30, true],
    [31, false],
  ])('a display name of %i chars is valid: %s', (length, valid) => {
    expect(updateMeSchema.safeParse({ displayName: 'x'.repeat(length) }).success).toBe(valid);
  });

  it.each([0, 7, 2.5])('rejects avatarId %s', (avatarId) => {
    expect(updateMeSchema.safeParse({ avatarId }).success).toBe(false);
  });

  it('allows clearing the avatar', () => {
    expect(updateMeSchema.parse({ avatarId: null })).toEqual({ avatarId: null });
  });

  it('rejects unknown fields such as role', () => {
    expect(updateMeSchema.safeParse({ role: 'admin' }).success).toBe(false);
  });

  it('rejects an unknown locale or visibility', () => {
    expect(updateMeSchema.safeParse({ locale: 'de' }).success).toBe(false);
    expect(updateMeSchema.safeParse({ profileVisibility: 'private' }).success).toBe(false);
  });
});
