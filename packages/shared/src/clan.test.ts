import { describe, expect, it } from 'vitest';

import {
  clanListQuerySchema,
  createClanSchema,
  updateClanMemberSchema,
  updateClanSchema,
} from './clan.js';

describe('createClanSchema', () => {
  it('trims the name before checking its length (BR-CLAN-2)', () => {
    expect(createClanSchema.parse({ name: '  Rye  ' })).toEqual({ name: 'Rye' });
    expect(createClanSchema.safeParse({ name: ' Ry ' }).success).toBe(false);
  });

  it.each([
    [2, false],
    [3, true],
    [40, true],
    [41, false],
  ])('a name of %i chars is valid: %s', (length, valid) => {
    expect(createClanSchema.safeParse({ name: 'x'.repeat(length) }).success).toBe(valid);
  });

  it('allows a description of up to 280 chars, or none', () => {
    expect(createClanSchema.safeParse({ name: 'Rye', description: 'x'.repeat(280) }).success).toBe(
      true,
    );
    expect(createClanSchema.safeParse({ name: 'Rye', description: 'x'.repeat(281) }).success).toBe(
      false,
    );
    expect(createClanSchema.safeParse({ name: 'Rye', description: null }).success).toBe(true);
  });

  it('rejects unknown fields', () => {
    expect(createClanSchema.safeParse({ name: 'Rye', ownerId: 'x' }).success).toBe(false);
    expect(updateClanSchema.safeParse({ memberCount: 3 }).success).toBe(false);
  });
});

describe('clanListQuerySchema', () => {
  it('treats a blank search as none and trims the rest', () => {
    expect(clanListQuerySchema.parse({ search: '   ' }).search).toBeUndefined();
    expect(clanListQuerySchema.parse({ search: ' rye ' }).search).toBe('rye');
  });
});

describe('updateClanMemberSchema', () => {
  it('allows officer and member, but not owner (a transfer gives that)', () => {
    expect(updateClanMemberSchema.safeParse({ role: 'officer' }).success).toBe(true);
    expect(updateClanMemberSchema.safeParse({ role: 'member' }).success).toBe(true);
    expect(updateClanMemberSchema.safeParse({ role: 'owner' }).success).toBe(false);
  });
});
