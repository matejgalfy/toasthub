import { useInfiniteQuery } from '@tanstack/react-query';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';

import { LoadMore } from '@/components/load-more';
import { PageHeader } from '@/components/page-header';
import { PageSpinner } from '@/components/page-spinner';
import { QueryError } from '@/components/query-error';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { EditSessionDialog } from '@/features/toast-sessions/edit-session-dialog';
import { SessionList } from '@/features/toast-sessions/session-list';
import { toastSessionsQueryOptions } from '@/features/toast-sessions/toast-sessions-api';

/** The own toast sessions, newest first; today's can be edited (SPEC §9 `/toasts`). */
export function MyToastsPage() {
  const { t } = useTranslation();
  const sessions = useInfiniteQuery(toastSessionsQueryOptions);
  const [editingId, setEditingId] = useState<string | null>(null);
  const { hasNextPage, isFetchingNextPage, fetchNextPage } = sessions;
  const loadMore = useCallback(() => {
    if (hasNextPage && !isFetchingNextPage) void fetchNextPage();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  const items = sessions.data?.pages.flatMap((page) => page.items) ?? [];
  // The live row, so the dialog shows the session as refetched after each change.
  const editing = items.find((session) => session.id === editingId) ?? null;

  return (
    <>
      <PageHeader title={t('pages.myToasts.title')} />
      {sessions.isPending ? (
        <PageSpinner />
      ) : sessions.isError ? (
        <QueryError error={sessions.error} onRetry={() => void sessions.refetch()} />
      ) : items.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-start gap-4">
            <p className="text-muted-foreground">{t('toasts.empty')}</p>
            <Button asChild variant="outline">
              <Link to="/home">{t('toasts.backHome')}</Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="flex flex-col gap-6">
          <SessionList
            sessions={items}
            onEdit={(session) => {
              setEditingId(session.id);
            }}
          />
          {hasNextPage && (
            <LoadMore label={t('toasts.loadMore')} onLoad={loadMore} loading={isFetchingNextPage} />
          )}
        </div>
      )}
      <EditSessionDialog
        session={editing}
        onClose={() => {
          setEditingId(null);
        }}
      />
    </>
  );
}
