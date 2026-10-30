import { useInfiniteQuery } from '@tanstack/react-query';
import { Flag } from 'lucide-react';
import { useCallback, useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { toast } from 'sonner';

import { FLAG_REASON_MAX, type ClanFeedItem } from '@toasthub/shared';

import { ApiError, errorMessageKey } from '@/api/errors';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { UserAvatar } from '@/components/user-avatar';
import { LoadMore } from '@/components/load-more';
import { PageSpinner } from '@/components/page-spinner';
import { QueryError } from '@/components/query-error';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useFormat } from '@/i18n/format';
import { cn } from '@/lib/utils';

import { clanFeedQueryOptions, useReportPhoto, useToggleLike } from './clans-api';

/** Current members' toast sessions, newest first, with 🍞 likes and photo reports (SPEC §4.8, §4.9). */
export function ClanFeed({ clanId }: { clanId: string }) {
  const { t } = useTranslation();
  const feed = useInfiniteQuery(clanFeedQueryOptions(clanId));
  const like = useToggleLike(clanId);
  const [reporting, setReporting] = useState<ClanFeedItem | null>(null);
  const { hasNextPage, isFetchingNextPage, fetchNextPage } = feed;
  const loadMore = useCallback(() => {
    if (hasNextPage && !isFetchingNextPage) void fetchNextPage();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  if (feed.isPending) return <PageSpinner className="min-h-40" />;
  if (feed.isError) return <QueryError error={feed.error} onRetry={() => void feed.refetch()} />;
  const items = feed.data.pages.flatMap((page) => page.items);
  if (items.length === 0) return <p className="text-muted-foreground">{t('clans.feed.empty')}</p>;

  const toggleLike = (item: ClanFeedItem) => {
    like.mutate(
      { toastId: item.toastId, liked: !item.likedByMe },
      {
        onError: (error) => {
          toast.error(t(errorMessageKey(error)));
        },
      },
    );
  };

  return (
    <div className="flex flex-col gap-4">
      <ul className="flex flex-col gap-3">
        {items.map((item) => (
          <li key={item.sessionId}>
            <FeedItem
              item={item}
              onLike={() => {
                toggleLike(item);
              }}
              onReport={() => {
                setReporting(item);
              }}
            />
          </li>
        ))}
      </ul>
      {hasNextPage && (
        <LoadMore label={t('clans.feed.loadMore')} onLoad={loadMore} loading={isFetchingNextPage} />
      )}
      <ReportDialog
        item={reporting}
        onClose={() => {
          setReporting(null);
        }}
      />
    </div>
  );
}

function FeedItem({
  item,
  onLike,
  onReport,
}: {
  item: ClanFeedItem;
  onLike: () => void;
  onReport: () => void;
}) {
  const { t } = useTranslation();
  const format = useFormat();
  const { user } = item;
  const toasts = t('toasts.count', { count: item.count });
  return (
    <Card className="gap-3 py-4">
      <CardContent className="flex flex-col gap-3 px-4">
        <div className="flex items-center gap-3">
          <UserAvatar name={user.displayName} avatarId={user.avatarId} size="sm" />
          <div className="flex min-w-0 flex-col">
            <Link to={`/u/${user.id}`} className="font-medium wrap-break-word hover:underline">
              {user.displayName}
            </Link>
            <span className="text-xs text-muted-foreground">{format.dateTime(item.loggedAt)}</span>
          </div>
          <span className="ml-auto shrink-0 font-semibold tabular-nums">{toasts}</span>
        </div>
        {item.photoUrl && (
          <img
            src={item.photoUrl}
            alt={t('clans.feed.photoAlt', { name: user.displayName, toasts })}
            loading="lazy"
            className="aspect-square w-full rounded-md bg-muted object-cover"
          />
        )}
        <div className="flex items-center justify-between gap-2">
          <Button
            variant="ghost"
            size="sm"
            aria-pressed={item.likedByMe}
            aria-label={t('clans.feed.like', { likes: format.number(item.likeCount) })}
            onClick={onLike}
            className={cn(
              'tabular-nums',
              item.likedByMe && 'bg-secondary text-secondary-foreground',
            )}
          >
            <span aria-hidden="true" className={cn(!item.likedByMe && 'grayscale')}>
              🍞
            </span>
            <span aria-hidden="true">{format.number(item.likeCount)}</span>
          </Button>
          {/* Only photos can be reported (BR-MOD-3). */}
          {item.photoUrl && (
            <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={onReport}>
              <Flag aria-hidden="true" />
              {t('clans.feed.report')}
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

/** Reports a photo with an optional reason. `item` is null while the dialog is closed. */
function ReportDialog({ item, onClose }: { item: ClanFeedItem | null; onClose: () => void }) {
  const { t } = useTranslation();
  const id = useId();
  const report = useReportPhoto();
  const [reason, setReason] = useState('');

  const close = () => {
    setReason('');
    report.reset();
    onClose();
  };
  // A photo hidden or removed meanwhile can't be reported any more.
  const gone = report.error instanceof ApiError && report.error.status === 409;

  return (
    <ConfirmDialog
      open={item !== null}
      onCancel={close}
      onConfirm={() => {
        if (!item) return;
        report.mutate(
          { toastId: item.toastId, reason },
          {
            onSuccess: () => {
              toast.success(t('clans.report.done'));
              close();
            },
          },
        );
      }}
      title={t('clans.report.title')}
      description={t('clans.report.description')}
      confirmLabel={t('clans.report.submit')}
      pending={report.isPending}
      error={report.error}
      errorMessage={gone ? t('clans.report.gone') : undefined}
    >
      <div className="flex flex-col gap-2">
        <Label htmlFor={`${id}-reason`}>{t('clans.report.reason')}</Label>
        <Textarea
          id={`${id}-reason`}
          rows={3}
          maxLength={FLAG_REASON_MAX}
          value={reason}
          onChange={(event) => {
            setReason(event.target.value);
          }}
        />
      </div>
    </ConfirmDialog>
  );
}
