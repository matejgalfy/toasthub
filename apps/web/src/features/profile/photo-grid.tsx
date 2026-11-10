import { useInfiniteQuery } from '@tanstack/react-query';
import { useCallback, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import type { UserToast } from '@toasthub/shared';

import { LoadMore } from '@/components/load-more';
import { QueryError } from '@/components/query-error';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Comments } from '@/features/comments/comments';
import { useFormat } from '@/i18n/format';

import { userToastsQueryOptions } from './profile-api';
import { SectionSpinner } from './profile-section';

/** The user's visible photos, one per session, newest first, loaded as the grid scrolls. */
export function PhotoGrid({ userId }: { userId: string }) {
  const { t } = useTranslation();
  const format = useFormat();
  const [selected, setSelected] = useState<UserToast | null>(null);
  const openedFrom = useRef<HTMLButtonElement | null>(null);
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
    <Dialog
      open={selected !== null}
      onOpenChange={(open) => {
        if (!open) setSelected(null);
      }}
    >
      <div className="flex flex-col gap-4">
        <ul className="grid grid-cols-3 gap-1.5">
          {items.map((toast) => (
            <li key={toast.id}>
              <DialogTrigger asChild>
                <button
                  type="button"
                  className="block w-full rounded-md focus-visible:outline-2 focus-visible:outline-ring"
                  aria-label={t('comments.openPhoto', {
                    date: format.localDate(toast.localDate, { dateStyle: 'long' }),
                    toasts: t('toasts.count', { count: toast.count }),
                  })}
                  onClick={(event) => {
                    openedFrom.current = event.currentTarget;
                    setSelected(toast);
                  }}
                >
                  <img
                    src={toast.photoUrl}
                    alt={t('profilePage.photos.alt', {
                      toasts: t('toasts.count', { count: toast.count }),
                      date: format.localDate(toast.localDate, { dateStyle: 'long' }),
                    })}
                    loading="lazy"
                    className="aspect-square w-full rounded-md bg-muted object-cover"
                  />
                </button>
              </DialogTrigger>
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
      <DialogContent
        className="max-h-[90dvh] overflow-y-auto"
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          openedFrom.current?.focus();
        }}
      >
        <DialogTitle>{t('comments.photoTitle')}</DialogTitle>
        {selected && (
          <>
            <DialogDescription>
              {t('profilePage.photos.alt', {
                toasts: t('toasts.count', { count: selected.count }),
                date: format.localDate(selected.localDate, { dateStyle: 'long' }),
              })}
            </DialogDescription>
            <img
              src={selected.photoUrl}
              alt={t('profilePage.photos.alt', {
                toasts: t('toasts.count', { count: selected.count }),
                date: format.localDate(selected.localDate, { dateStyle: 'long' }),
              })}
              className="aspect-square w-full rounded-md bg-muted object-cover"
            />
            <Comments key={selected.id} toastId={selected.id} />
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
