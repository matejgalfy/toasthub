import { describe, expect, it } from 'vitest';

import {
  commentPageSchema,
  commentQuerySchema,
  commentSchema,
  createCommentSchema,
} from './comment.js';

const ID = '01890a5d-ac96-774b-bcce-b302099a8057';
const OTHER_ID = '01890a5d-ac96-774b-bcce-b302099a8058';
const comment = {
  id: ID,
  toastId: OTHER_ID,
  parentId: null,
  createdAt: '2026-06-01T12:00:00.000Z',
  deleted: false,
  body: 'Nice toast!',
  author: { id: ID, displayName: 'Ann', avatarId: null },
  canDelete: true,
  likeCount: 0,
  likedByMe: false,
};

describe('createCommentSchema', () => {
  it('trims the body and allows an omitted, null or UUID parent', () => {
    expect(createCommentSchema.parse({ body: '  Nice toast!  ' })).toEqual({ body: 'Nice toast!' });
    expect(createCommentSchema.parse({ body: 'x', parentId: null })).toEqual({
      body: 'x',
      parentId: null,
    });
    expect(createCommentSchema.parse({ body: 'x', parentId: ID })).toEqual({
      body: 'x',
      parentId: ID,
    });
  });

  it('accepts 1–500 characters after trimming', () => {
    expect(createCommentSchema.safeParse({ body: ' x ' }).success).toBe(true);
    expect(createCommentSchema.parse({ body: `  ${'x'.repeat(500)}  ` }).body).toHaveLength(500);
  });

  it.each([
    {},
    { body: '' },
    { body: ' \n\t ' },
    { body: 'x'.repeat(501) },
    { body: null },
    { body: 1 },
  ])('rejects invalid body %j', (input) => {
    expect(createCommentSchema.safeParse(input).success).toBe(false);
  });

  it.each(['not-a-uuid', '', 1])('rejects parentId=%j', (parentId) => {
    expect(createCommentSchema.safeParse({ body: 'x', parentId }).success).toBe(false);
  });

  it('rejects unknown fields rather than silently stripping them', () => {
    expect(createCommentSchema.safeParse({ body: 'x', toastId: ID }).success).toBe(false);
    expect(createCommentSchema.safeParse({ body: 'x', deleted: true }).success).toBe(false);
  });
});

describe('commentQuerySchema', () => {
  it('extends page query with optional boolean topLevel values', () => {
    const withoutFilter = commentQuerySchema.parse({});
    expect(withoutFilter.limit).toBe(20);
    expect(withoutFilter.topLevel).toBeUndefined();
    expect(commentQuerySchema.parse({ topLevel: 'true', limit: '3' })).toMatchObject({
      topLevel: true,
      limit: 3,
    });
    expect(commentQuerySchema.parse({ topLevel: 'false' })).toMatchObject({
      topLevel: false,
      limit: 20,
    });
  });

  it.each(['', 'yes', 'TRUE', true])('rejects invalid topLevel=%j', (topLevel) => {
    expect(commentQuerySchema.safeParse({ topLevel }).success).toBe(false);
  });
});

describe('commentSchema', () => {
  it('parses a live comment and a reply with a user summary', () => {
    expect(commentSchema.parse(comment)).toEqual(comment);
    expect(commentSchema.parse({ ...comment, parentId: OTHER_ID, canDelete: false }).parentId).toBe(
      OTHER_ID,
    );
  });

  it('parses a deleted placeholder without body, author or delete permission', () => {
    const placeholder = { ...comment, deleted: true, body: null, author: null, canDelete: false };
    expect(commentSchema.parse(placeholder)).toEqual(placeholder);
  });

  it.each([
    { id: 'bad' },
    { toastId: 'bad' },
    { parentId: 'bad' },
    { createdAt: '2026-06-01' },
    { deleted: 'true' },
    { body: 1 },
    { author: { id: ID, displayName: 'Ann' } },
    { canDelete: 'true' },
    { likeCount: -1 },
    { likeCount: 1.5 },
    { likeCount: '1' },
    { likedByMe: 'true' },
  ])('rejects invalid response fields %j', (change) => {
    expect(commentSchema.safeParse({ ...comment, ...change }).success).toBe(false);
  });

  it.each([
    'parentId',
    'createdAt',
    'deleted',
    'body',
    'author',
    'canDelete',
    'likeCount',
    'likedByMe',
  ] as const)('requires %s even when the field may be null', (field) => {
    const input = Object.fromEntries(Object.entries(comment).filter(([key]) => key !== field));
    expect(commentSchema.safeParse(input).success).toBe(false);
  });
});

describe('commentPageSchema', () => {
  it('uses the standard items and nullable nextCursor envelope', () => {
    expect(commentPageSchema.parse({ items: [comment], nextCursor: 'cursor' })).toEqual({
      items: [comment],
      nextCursor: 'cursor',
    });
    expect(commentPageSchema.parse({ items: [], nextCursor: null })).toEqual({
      items: [],
      nextCursor: null,
    });
    expect(commentPageSchema.safeParse({ items: [], nextCursor: '' }).success).toBe(false);
  });
});
