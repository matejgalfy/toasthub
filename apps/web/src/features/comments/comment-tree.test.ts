import { describe, expect, it } from 'vitest';

import type { Comment } from '@toasthub/shared';

import { buildCommentThread, visibleCommentThread } from './comment-tree';

const comment = (id: string, parentId: string | null = null): Comment => ({
  id,
  parentId,
  toastId: 'toast',
  body: id,
  author: { id: 'user', displayName: 'Mia', avatarId: null },
  createdAt: '2026-10-28T07:00:00.000Z',
  deleted: false,
  canDelete: true,
  likeCount: 0,
  likedByMe: false,
});

describe('buildCommentThread', () => {
  it('groups flat paginated rows in preorder with oldest-first siblings', () => {
    const rows = buildCommentThread([
      comment('root'),
      comment('other'),
      comment('reply', 'root'),
      comment('nested', 'reply'),
      comment('reply2', 'root'),
    ]);
    expect(rows.map(({ comment, depth }) => [comment.id, depth])).toEqual([
      ['root', 0],
      ['reply', 1],
      ['nested', 2],
      ['reply2', 1],
      ['other', 0],
    ]);
    expect(rows[2]?.parent?.id).toBe('reply');
  });

  it('preserves deleted placeholders and their replies, deduplicating loaded rows', () => {
    const deleted = {
      ...comment('root'),
      body: null,
      author: null,
      deleted: true,
      canDelete: false,
    };
    const rows = buildCommentThread([deleted, comment('reply', 'root'), deleted]);
    expect(rows).toHaveLength(2);
    expect(rows[0]?.comment.deleted).toBe(true);
    expect(rows[1]?.parent).toBe(deleted);
  });

  it('renders a missing parent as a root', () => {
    expect(buildCommentThread([comment('reply', 'missing')])[0]).toMatchObject({
      depth: 0,
      parent: null,
    });
  });

  it('supports deep threads without recursion or capping the actual depth', () => {
    const rows = buildCommentThread(
      Array.from({ length: 15000 }, (_, index) =>
        comment(String(index), index ? String(index - 1) : null),
      ),
    );
    expect(rows).toHaveLength(15000);
    expect(rows.at(-1)?.depth).toBe(14999);
  });
});

describe('visibleCommentThread', () => {
  const rows = buildCommentThread([
    comment('root'),
    comment('reply', 'root'),
    comment('nested', 'reply'),
    comment('sibling', 'root'),
    comment('other'),
    comment('other-reply', 'other'),
  ]);
  const ids = (collapsed: ReadonlySet<string>) =>
    visibleCommentThread(rows, collapsed).map(({ comment }) => comment.id);

  it('hides only descendants while keeping the parent and sibling threads visible', () => {
    expect(ids(new Set(['reply']))).toEqual(['root', 'reply', 'sibling', 'other', 'other-reply']);
    expect(ids(new Set(['root']))).toEqual(['root', 'other', 'other-reply']);
    expect(ids(new Set())).toEqual(['root', 'reply', 'nested', 'sibling', 'other', 'other-reply']);
  });

  it('preserves a nested collapse when its ancestor is expanded again', () => {
    const collapsed = new Set(['reply', 'root']);
    expect(ids(collapsed)).toEqual(['root', 'other', 'other-reply']);
    collapsed.delete('root');
    expect(ids(collapsed)).toEqual(['root', 'reply', 'sibling', 'other', 'other-reply']);
    collapsed.delete('reply');
    expect(ids(collapsed)).toContain('nested');
  });

  it('supports very deep collapsed threads without recursion', () => {
    const deepRows = buildCommentThread(
      Array.from({ length: 15000 }, (_, index) =>
        comment(String(index), index ? String(index - 1) : null),
      ),
    );
    expect(visibleCommentThread(deepRows, new Set(['1']))).toHaveLength(2);
    expect(visibleCommentThread(deepRows, new Set())).toHaveLength(15000);
  });
});
