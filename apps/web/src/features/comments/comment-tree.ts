import type { Comment } from '@toasthub/shared';

export interface CommentThreadRow {
  comment: Comment;
  depth: number;
  parent: Comment | null;
}

/** Preorder without recursion: even a very deep thread cannot exhaust the call stack. */
export function buildCommentThread(comments: Comment[]): CommentThreadRow[] {
  const byId = new Map(comments.map((comment) => [comment.id, comment]));
  const children = new Map<string, Comment[]>();
  const roots: Comment[] = [];
  for (const comment of byId.values()) {
    if (comment.parentId && byId.has(comment.parentId)) {
      const siblings = children.get(comment.parentId) ?? [];
      siblings.push(comment);
      children.set(comment.parentId, siblings);
    } else {
      roots.push(comment);
    }
  }
  const stack: CommentThreadRow[] = roots
    .toReversed()
    .map((comment) => ({ comment, depth: 0, parent: null }));
  const rows: CommentThreadRow[] = [];
  while (stack.length > 0) {
    const row = stack.pop();
    if (!row) break;
    rows.push(row);
    const replies = children.get(row.comment.id) ?? [];
    for (let index = replies.length - 1; index >= 0; index--) {
      const comment = replies[index];
      if (comment) stack.push({ comment, depth: row.depth + 1, parent: row.comment });
    }
  }
  return rows;
}
