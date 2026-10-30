import { useInfiniteQuery } from '@tanstack/react-query';
import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';

import { LoadMore } from '@/components/load-more';
import { PageHeader } from '@/components/page-header';
import { PageSpinner } from '@/components/page-spinner';
import { QueryError } from '@/components/query-error';
import { Card, CardContent } from '@/components/ui/card';
import { totwHistoryQueryOptions } from '@/features/toast-of-the-week/totw-api';
import { TotwEntry } from '@/features/toast-of-the-week/totw-entry';

/** Past winners by week, newest first (SPEC §9 `/toast-of-the-week`). */
export function ToastOfTheWeekPage() {
  const { t } = useTranslation();
  const history = useInfiniteQuery(totwHistoryQueryOptions);
  const { hasNextPage, isFetchingNextPage, fetchNextPage } = history;
  const loadMore = useCallback(() => {
    if (hasNextPage && !isFetchingNextPage) void fetchNextPage();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  const items = history.data?.pages.flatMap((page) => page.items) ?? [];

  return (
    <>
      <PageHeader title={t('pages.toastOfTheWeek.title')} />
      {history.isPending ? (
        <PageSpinner />
      ) : history.isError ? (
        <QueryError error={history.error} onRetry={() => void history.refetch()} />
      ) : items.length === 0 ? (
        <Card>
          <CardContent>
            <p className="text-muted-foreground">{t('totw.empty')}</p>
          </CardContent>
        </Card>
      ) : (
        <div className="flex flex-col gap-4">
          <ul className="flex flex-col gap-3">
            {items.map((entry) => (
              <li key={entry.weekStart}>
                <Card className="py-4">
                  <CardContent className="px-4">
                    <TotwEntry entry={entry} />
                  </CardContent>
                </Card>
              </li>
            ))}
          </ul>
          {hasNextPage && (
            <LoadMore label={t('totw.loadMore')} onLoad={loadMore} loading={isFetchingNextPage} />
          )}
        </div>
      )}
    </>
  );
}
