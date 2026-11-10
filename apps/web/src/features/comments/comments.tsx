import { useInfiniteQuery } from '@tanstack/react-query';
import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { toast } from 'sonner';

import { COMMENT_BODY_MAX, type Comment } from '@toasthub/shared';

import { errorMessageKey } from '@/api/errors';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { PageSpinner } from '@/components/page-spinner';
import { QueryError } from '@/components/query-error';
import { UserAvatar } from '@/components/user-avatar';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useFormat } from '@/i18n/format';
import { cn } from '@/lib/utils';

import { buildCommentThread } from './comment-tree';
import {
  commentsQueryOptions,
  useCreateComment,
  useDeleteComment,
  useToggleCommentLike,
} from './comments-api';

export function Comments({ toastId }: { toastId: string }) {
  const { t } = useTranslation();
  const id = useId();
  const [expanded, setExpanded] = useState(false);
  const query = useInfiniteQuery(commentsQueryOptions(toastId, !expanded));
  const items = query.data?.pages.flatMap((page) => page.items) ?? [];
  const roots = items.filter((comment) => comment.parentId === null).slice(0, 3);
  const preview = [
    ...roots,
    ...items.filter((comment) => comment.parentId !== null).slice(0, 3 - roots.length),
  ];
  const rows = buildCommentThread(expanded ? items : preview);
  return (
    <section aria-labelledby={id} className="flex min-w-0 flex-col gap-2">
      <h3 id={id} className="font-semibold">
        {t('comments.title')}
      </h3>
      {query.isPending && <PageSpinner className="min-h-16" />}
      {query.isError && <QueryError error={query.error} onRetry={() => void query.refetch()} />}
      {query.isSuccess && rows.length === 0 && (
        <p className="text-sm text-muted-foreground">{t('comments.empty')}</p>
      )}
      {rows.length > 0 && (
        <ol className="flex flex-col gap-2">
          {rows.map(({ comment, depth, parent }) => (
            <li
              key={comment.id}
              id={`${id}-${comment.id}`}
              style={{ marginInlineStart: `${String(Math.min(depth, 3) * 0.75)}rem` }}
            >
              <CommentRow
                toastId={toastId}
                comment={comment}
                parent={parent}
                parentLink={parent ? `#${id}-${parent.id}` : undefined}
              />
            </li>
          ))}
        </ol>
      )}
      {!expanded && rows.length > 0 && (
        <Button
          variant="outline"
          size="xs"
          className="self-start"
          onClick={() => {
            setExpanded(true);
          }}
          aria-expanded={false}
        >
          {t('comments.showAll')}
        </Button>
      )}
      {expanded && query.hasNextPage && (
        <Button
          variant="outline"
          size="xs"
          className="self-start"
          disabled={query.isFetchingNextPage}
          onClick={() => void query.fetchNextPage()}
        >
          {t('comments.loadMore')}
        </Button>
      )}
      <CommentForm toastId={toastId} />
    </section>
  );
}

function CommentRow({
  toastId,
  comment,
  parent,
  parentLink,
}: {
  toastId: string;
  comment: Comment;
  parent: Comment | null;
  parentLink?: string;
}) {
  const { t } = useTranslation();
  const format = useFormat();
  const [replying, setReplying] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const remove = useDeleteComment(toastId);
  const like = useToggleCommentLike(toastId);
  const authorName = comment.author?.displayName ?? t('comments.deleted');
  // Cached comments from before reactions were added may not have a count yet.
  const likeCount = Number.isFinite(comment.likeCount) ? comment.likeCount : 0;
  return (
    <article className="flex min-w-0 flex-col gap-1 border-l border-border pl-2 text-sm">
      {parent && (
        <a href={parentLink} className="text-xs text-muted-foreground hover:underline">
          {t('comments.replyingTo', { name: parent.author?.displayName ?? t('comments.deleted') })}
        </a>
      )}
      <div className="flex flex-wrap items-center gap-2">
        {comment.author && (
          <>
            <UserAvatar
              name={comment.author.displayName}
              avatarId={comment.author.avatarId}
              size="sm"
            />
            <Link
              to={`/u/${comment.author.id}`}
              className="font-medium wrap-break-word hover:underline"
            >
              {comment.author.displayName}
            </Link>
          </>
        )}
        <time dateTime={comment.createdAt} className="text-xs text-muted-foreground">
          {format.dateTime(comment.createdAt)}
        </time>
      </div>
      <p className="wrap-anywhere whitespace-pre-wrap">
        {comment.deleted ? t('comments.deleted') : comment.body}
      </p>
      <div className="flex flex-wrap gap-1">
        {!comment.deleted && (
          <Button
            variant="ghost"
            size="xs"
            aria-pressed={comment.likedByMe}
            disabled={like.isPending}
            className={cn(
              'tabular-nums',
              comment.likedByMe && 'bg-secondary text-secondary-foreground',
            )}
            onClick={() => {
              like.mutate({ commentId: comment.id, liked: !comment.likedByMe });
            }}
          >
            <span aria-hidden="true" className={cn(!comment.likedByMe && 'grayscale')}>
              🍞
            </span>
            <span className="sr-only">{t('feed.like')}</span>{' '}
            <span>{format.number(likeCount)}</span>
          </Button>
        )}
        <Button
          variant="ghost"
          size="xs"
          aria-label={t('comments.replyTo', { name: authorName })}
          aria-expanded={replying}
          onClick={() => {
            setReplying(!replying);
          }}
        >
          {t('comments.reply')}
        </Button>
        {comment.canDelete && !comment.deleted && (
          <Button
            variant="ghost"
            size="xs"
            className="text-destructive"
            aria-label={t('comments.deleteBy', { name: authorName })}
            disabled={remove.isPending}
            onClick={() => {
              setDeleting(true);
            }}
          >
            {t('comments.delete')}
          </Button>
        )}
      </div>
      {like.isError && <p role="alert">{t(errorMessageKey(like.error))}</p>}
      <ConfirmDialog
        open={deleting}
        onCancel={() => {
          setDeleting(false);
          remove.reset();
        }}
        onConfirm={() => {
          remove.mutate(comment.id, {
            onSuccess: () => {
              setDeleting(false);
            },
          });
        }}
        title={t('comments.deleteTitle')}
        description={t('comments.deleteDescription')}
        confirmLabel={t('comments.delete')}
        pending={remove.isPending}
        error={remove.error}
      />
      {replying && (
        <CommentForm
          toastId={toastId}
          parentId={comment.id}
          onDone={() => {
            setReplying(false);
          }}
        />
      )}
    </article>
  );
}

function CommentForm({
  toastId,
  parentId,
  onDone,
}: {
  toastId: string;
  parentId?: string;
  onDone?: () => void;
}) {
  const { t } = useTranslation();
  const id = useId();
  const [body, setBody] = useState('');
  const create = useCreateComment(toastId);
  const trimmed = body.trim();
  return (
    <form
      className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] gap-1.5"
      onSubmit={(event) => {
        event.preventDefault();
        if (!trimmed || trimmed.length > COMMENT_BODY_MAX || create.isPending) return;
        create.mutate(
          { body: trimmed, ...(parentId ? { parentId } : {}) },
          {
            onSuccess: () => {
              setBody('');
              toast.success(t('comments.posted'));
              onDone?.();
            },
          },
        );
      }}
    >
      <Label htmlFor={id} className="col-span-2 text-xs">
        {t(parentId ? 'comments.replyBody' : 'comments.body')}
      </Label>
      <Textarea
        id={id}
        rows={1}
        className="min-h-9 py-1.5"
        maxLength={COMMENT_BODY_MAX}
        value={body}
        disabled={create.isPending}
        onChange={(event) => {
          setBody(event.target.value);
        }}
      />
      {create.isError && (
        <p role="alert" className="col-span-2">
          {t(errorMessageKey(create.error))}
        </p>
      )}
      <div className="col-start-2 row-start-2 flex flex-wrap items-center gap-1">
        <Button
          size="xs"
          disabled={!trimmed || trimmed.length > COMMENT_BODY_MAX || create.isPending}
          type="submit"
        >
          {t(parentId ? 'comments.submitReply' : 'comments.submit')}
        </Button>
        {onDone && (
          <Button
            size="xs"
            variant="ghost"
            type="button"
            disabled={create.isPending}
            onClick={onDone}
          >
            {t('app.cancel')}
          </Button>
        )}
      </div>
    </form>
  );
}
