import { useInfiniteQuery } from '@tanstack/react-query';
import { useCallback, useId, useState, type SubmitEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

import { addDays, isoWeekday, type LocalDate, localDate, weekStart } from '@toasthub/shared';

import { ApiError } from '@/api/errors';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { LoadMore } from '@/components/load-more';
import { PageHeader } from '@/components/page-header';
import { PageSpinner } from '@/components/page-spinner';
import { QueryError } from '@/components/query-error';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useRedraw } from '@/features/admin/admin-api';
import { totwHistoryQueryOptions } from '@/features/toast-of-the-week/totw-api';
import { TotwEntry, useWeekLabel } from '@/features/toast-of-the-week/totw-entry';

/** Past draws with a redraw for each, and a draw for any ended week (SPEC §4.13). */
export function AdminTotwPage() {
  const { t } = useTranslation();
  const weekLabel = useWeekLabel();
  const redraw = useRedraw();
  const [confirming, setConfirming] = useState<LocalDate | null>(null);

  const ask = (week: LocalDate) => {
    redraw.reset();
    setConfirming(week);
  };

  return (
    <>
      <PageHeader title={t('admin.nav.totw')} />
      <div className="flex flex-col gap-6">
        <DrawForm onDraw={ask} />
        <History onRedraw={ask} />
      </div>
      <ConfirmDialog
        open={confirming !== null}
        onCancel={() => {
          setConfirming(null);
        }}
        onConfirm={() => {
          if (confirming === null) return;
          redraw.mutate(confirming, {
            onSuccess: () => {
              setConfirming(null);
              toast.success(t('admin.totw.done'));
            },
          });
        }}
        title={t('admin.totw.confirmTitle', { week: confirming ? weekLabel(confirming) : '' })}
        description={t('admin.totw.confirmDescription')}
        confirmLabel={t('admin.totw.redraw')}
        variant="default"
        pending={redraw.isPending}
        error={redraw.error}
        // The only conflict: the week hasn't ended yet (SPEC §12 D51).
        errorMessage={
          redraw.error instanceof ApiError && redraw.error.status === 409
            ? t('admin.totw.notOver')
            : undefined
        }
      />
    </>
  );
}

/** Any ended week by its Monday; last week by default. */
function DrawForm({ onDraw }: { onDraw: (week: LocalDate) => void }) {
  const { t } = useTranslation();
  const id = useId();
  const [week, setWeek] = useState(() => addDays(weekStart(localDate(new Date())), -7));
  const [notMonday, setNotMonday] = useState(false);

  const submit = (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    const monday = /^\d{4}-\d{2}-\d{2}$/.test(week) && isoWeekday(week) === 1;
    setNotMonday(!monday);
    if (monday) onDraw(week);
  };

  return (
    <Card className="max-w-xl">
      <CardContent>
        <form noValidate onSubmit={submit} className="flex flex-col gap-3">
          <h2 className="font-semibold">{t('admin.totw.drawHeading')}</h2>
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex flex-col gap-2">
              <Label htmlFor={`${id}-week`}>{t('admin.totw.week')}</Label>
              <Input
                id={`${id}-week`}
                type="date"
                className="w-44"
                value={week}
                aria-invalid={notMonday}
                aria-describedby={`${id}-week-hint`}
                onChange={(event) => {
                  setWeek(event.target.value);
                  setNotMonday(false);
                }}
              />
            </div>
            <Button type="submit" variant="outline">
              {t('admin.totw.draw')}
            </Button>
          </div>
          <p
            id={`${id}-week-hint`}
            className={notMonday ? 'text-sm text-destructive' : 'text-sm text-muted-foreground'}
          >
            {notMonday ? t('admin.totw.notMonday') : t('admin.totw.drawHint')}
          </p>
        </form>
      </CardContent>
    </Card>
  );
}

function History({ onRedraw }: { onRedraw: (week: LocalDate) => void }) {
  const { t } = useTranslation();
  const weekLabel = useWeekLabel();
  const history = useInfiniteQuery(totwHistoryQueryOptions);
  const { hasNextPage, isFetchingNextPage, fetchNextPage } = history;
  const loadMore = useCallback(() => {
    if (hasNextPage && !isFetchingNextPage) void fetchNextPage();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  if (history.isPending) return <PageSpinner className="min-h-40" />;
  if (history.isError) {
    return <QueryError error={history.error} onRetry={() => void history.refetch()} />;
  }
  const items = history.data.pages.flatMap((page) => page.items);
  return (
    <section className="flex flex-col gap-3">
      <h2 className="font-semibold">{t('admin.totw.history')}</h2>
      {items.length === 0 ? (
        <p className="text-muted-foreground">{t('totw.empty')}</p>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
          {items.map((entry) => (
            <li key={entry.weekStart}>
              <Card className="h-full py-4">
                <CardContent className="flex flex-col gap-3 px-4">
                  <TotwEntry entry={entry} />
                  <Button
                    size="sm"
                    variant="outline"
                    className="self-start"
                    aria-label={t('admin.totw.redrawLabel', { week: weekLabel(entry.weekStart) })}
                    onClick={() => {
                      onRedraw(entry.weekStart);
                    }}
                  >
                    {t('admin.totw.redraw')}
                  </Button>
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      )}
      {hasNextPage && (
        <LoadMore label={t('totw.loadMore')} onLoad={loadMore} loading={isFetchingNextPage} />
      )}
    </section>
  );
}
