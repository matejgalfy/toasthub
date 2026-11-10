import { sql } from 'drizzle-orm';
import {
  type AnyPgColumn,
  check,
  index,
  pgTable,
  primaryKey,
  text,
  uuid,
} from 'drizzle-orm/pg-core';

import { user } from './auth';
import { createdAt, id, timestamptz } from './columns';
import { toast } from './toasts';

export const comment = pgTable(
  'comment',
  {
    id: id(),
    toastId: uuid()
      .notNull()
      .references(() => toast.id, { onDelete: 'cascade' }),
    authorId: uuid()
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    parentId: uuid().references((): AnyPgColumn => comment.id, { onDelete: 'cascade' }),
    body: text(),
    deletedAt: timestamptz(),
    createdAt: createdAt(),
  },
  (t) => [
    index('comment_toast_id_created_at_idx').on(t.toastId, t.createdAt, t.id),
    index('comment_parent_id_idx').on(t.parentId),
    check(
      'comment_body_length',
      sql`(${t.body} IS NULL AND ${t.deletedAt} IS NOT NULL) OR (${t.body} IS NOT NULL AND ${t.deletedAt} IS NULL AND char_length(${t.body}) BETWEEN 1 AND 500)`,
    ),
  ],
);

export const commentLike = pgTable(
  'comment_like',
  {
    userId: uuid()
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    commentId: uuid()
      .notNull()
      .references(() => comment.id, { onDelete: 'cascade' }),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.commentId, t.userId] })],
);
