import { describe, expect, it } from 'vitest';

import {
  adminFlagCommentSchema,
  adminFlagListQuerySchema,
  adminUpdateClanSchema,
  resolveFlagSchema,
  updateAppSettingsSchema,
} from './admin.js';

describe('adminFlagListQuerySchema', () => {
  it('treats blank filters as none', () => {
    expect(adminFlagListQuerySchema.parse({ type: '', status: ' ' })).toEqual({ limit: 20 });
  });

  it('accepts comment reports as a type filter', () => {
    expect(adminFlagListQuerySchema.parse({ type: 'comment_report' })).toEqual({
      type: 'comment_report',
      limit: 20,
    });
  });

  it('rejects an unknown type or status', () => {
    expect(adminFlagListQuerySchema.safeParse({ type: 'spam' }).success).toBe(false);
    expect(adminFlagListQuerySchema.safeParse({ status: 'closed' }).success).toBe(false);
  });
});

describe('adminFlagCommentSchema', () => {
  it('allows current or cleared text while preserving comment and thread context', () => {
    const comment = {
      id: '01890a5d-ac96-774b-bcce-b302099a8057',
      toastId: '01890a5d-ac96-774b-bcce-b302099a8058',
      parentId: null,
      createdAt: '2026-10-01T10:00:00.000Z',
      body: 'Reported comment',
      deleted: false,
    };
    expect(adminFlagCommentSchema.parse(comment)).toEqual(comment);
    expect(adminFlagCommentSchema.parse({ ...comment, body: null, deleted: true })).toMatchObject({
      id: comment.id,
      toastId: comment.toastId,
      parentId: null,
      body: null,
      deleted: true,
    });
  });
});

describe('resolveFlagSchema', () => {
  it('defaults ban to false', () => {
    expect(resolveFlagSchema.parse({ action: 'dismiss' })).toEqual({
      action: 'dismiss',
      ban: false,
    });
  });

  it('accepts delete_comment and defaults ban to false', () => {
    expect(resolveFlagSchema.parse({ action: 'delete_comment' })).toEqual({
      action: 'delete_comment',
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
