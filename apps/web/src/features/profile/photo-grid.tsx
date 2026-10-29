import { useInfiniteQuery } from '@tanstack/react-query';
import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';

import { LoadMore } from '@/components/load-more';
import { QueryError } from '@/components/query-error';
import { useFormat } from '@/i18n/format';

import { userToastsQueryOptions } from './profile-api';
import { SectionSpinner } from './profile-section';

/** The user's visible photos, one per session, newest first, loaded as the grid scrolls. */
export function PhotoGrid({ userId }: { userId: string }) {
  const { t } = useTranslation();
  const format = useFormat();
  const toasts = useInfiniteQuery(userToastsQueryOptions(userId));
  const { hasNextPage, isFetchingNextPage, fetchNextPage } = toasts;
  const loadMore = useCallback(() => {
    if (hasNextPage && !isFetchingNextPage) void fetchNextPage();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  if (toasts.isPending) return <SectionSpinner />;
  if (toasts.isError) {
    return <QueryError error={toasts.error} onRetry={() => void toasts.refetch()} />;
  }
  const items = toasts.data.pages.flatMap((page) => page.items);
  if (items.length === 0) {
    return <p className="text-muted-foreground">{t('profilePage.photos.empty')}</p>;
  }
  return (
    <div className="flex flex-col gap-4">
      <ul className="grid grid-cols-3 gap-1.5">
        {items.map((toast) => (
          <li key={toast.id}>
            <img
              src={toast.photoUrl}
              alt={t('profilePage.photos.alt', {
                toasts: t('toasts.count', { count: toast.count }),
                date: format.localDate(toast.localDate, { dateStyle: 'long' }),
              })}
              loading="lazy"
              className="aspect-square w-full rounded-md bg-muted object-cover"
            />
          </li>
        ))}
      </ul>
      {hasNextPage && (
        <LoadMore
          label={t('profilePage.photos.loadMore')}
          onLoad={loadMore}
          loading={isFetchingNextPage}
        />
      )}
    </div>
  );
}
