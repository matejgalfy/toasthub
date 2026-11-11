import { z } from 'zod';

import { pageQuerySchema, pageSchema } from './pagination.js';
import { userSummarySchema } from './profile.js';

export const COMMENT_BODY_MAX = 500;

export const createCommentSchema = z.strictObject({
  body: z.string().trim().min(1).max(COMMENT_BODY_MAX),
  parentId: z.uuid().nullable().optional(),
});
export type CreateComment = z.infer<typeof createCommentSchema>;

export const commentParamsSchema = z.object({ id: z.uuid() });

export const commentQuerySchema = pageQuerySchema.extend({
  topLevel: z
    .enum(['true', 'false'])
    .transform((value) => value === 'true')
    .optional(),
});
export type CommentQuery = z.infer<typeof commentQuerySchema>;

/** A flat thread row. Removed comments and banned authors are anonymous placeholders. */
export const commentSchema = z.object({
  id: z.uuid(),
  toastId: z.uuid(),
  parentId: z.uuid().nullable(),
  createdAt: z.iso.datetime(),
  deleted: z.boolean(),
  body: z.string().nullable(),
  author: userSummarySchema.nullable(),
  canDelete: z.boolean(),
  likeCount: z.int().nonnegative(),
  likedByMe: z.boolean(),
});
export type Comment = z.infer<typeof commentSchema>;

/** Oldest first, with every parent preceding its children. */
export const commentPageSchema = pageSchema(commentSchema);
export type CommentPage = z.infer<typeof commentPageSchema>;
