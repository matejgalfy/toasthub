import { describe, expect, it } from 'vitest';

import {
  adminFlagListQuerySchema,
  adminUpdateClanSchema,
  resolveFlagSchema,
  updateAppSettingsSchema,
} from './admin.js';

describe('adminFlagListQuerySchema', () => {
  it('treats blank filters as none', () => {
    expect(adminFlagListQuerySchema.parse({ type: '', status: ' ' })).toEqual({ limit: 20 });
  });

  it('rejects an unknown type or status', () => {
    expect(adminFlagListQuerySchema.safeParse({ type: 'spam' }).success).toBe(false);
    expect(adminFlagListQuerySchema.safeParse({ status: 'closed' }).success).toBe(false);
  });
});

describe('resolveFlagSchema', () => {
  it('defaults ban to false', () => {
    expect(resolveFlagSchema.parse({ action: 'dismiss' })).toEqual({
      action: 'dismiss',
      ban: false,
    });
  });

  it('rejects unknown actions and fields', () => {
    expect(resolveFlagSchema.safeParse({ action: 'delete' }).success).toBe(false);
    expect(resolveFlagSchema.safeParse({ action: 'dismiss', note: 'x' }).success).toBe(false);
  });
});

describe('adminUpdateClanSchema', () => {
  it('accepts an owner transfer alone', () => {
    const ownerId = '01890a5d-ac96-774b-bcce-b302099a8057';
    expect(adminUpdateClanSchema.parse({ ownerId })).toEqual({ ownerId });
  });

  it('rejects a bad owner id', () => {
    expect(adminUpdateClanSchema.safeParse({ ownerId: 'ann' }).success).toBe(false);
  });
});

describe('updateAppSettingsSchema', () => {
  it('accepts a partial patch and rejects unknown keys', () => {
    expect(updateAppSettingsSchema.parse({ clanMaxMembers: 12 })).toEqual({ clanMaxMembers: 12 });
    expect(updateAppSettingsSchema.safeParse({ maxClans: 3 }).success).toBe(false);
  });
});
