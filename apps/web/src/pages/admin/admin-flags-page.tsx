import { useInfiniteQuery } from '@tanstack/react-query';
import { useCallback, useId, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { FlagStatus, flagStatusSchema, FlagType, flagTypeSchema } from '@toasthub/shared';

import { LoadMore } from '@/components/load-more';
import { PageHeader } from '@/components/page-header';
import { NativeSelect } from '@/components/native-select';
import { PageSpinner } from '@/components/page-spinner';
import { QueryError } from '@/components/query-error';
import { Label } from '@/components/ui/label';
import { adminFlagsQueryOptions, type FlagFilters } from '@/features/admin/admin-api';
import { FlagCard } from '@/features/admin/flag-card';

const ALL = 'all';

/** The flag queue, open flags first by default (SPEC §4.13, BR-MOD-4). */
export function AdminFlagsPage() {
  const { t } = useTranslation();
  const id = useId();
  const [filters, setFilters] = useState<FlagFilters>({ type: null, status: FlagStatus.open });

  return (
    <>
      <PageHeader title={t('admin.nav.flags')} />
      <div className="flex flex-col gap-6">
        <div
          role="group"
          aria-label={t('admin.flags.filters')}
          className="flex flex-wrap items-end gap-4"
        >
          <div className="flex flex-col gap-2">
            <Label htmlFor={`${id}-type`}>{t('admin.flags.type')}</Label>
            <NativeSelect
              id={`${id}-type`}
              value={filters.type ?? ALL}
              onChange={(event) => {
                const parsed = flagTypeSchema.safeParse(event.target.value);
                setFilters({ ...filters, type: parsed.success ? parsed.data : null });
              }}
            >
              <option value={ALL}>{t('admin.flags.all')}</option>
              {Object.values(FlagType).map((type) => (
                <option key={type} value={type}>
                  {t(`admin.flags.types.${type}`)}
                </option>
              ))}
            </NativeSelect>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor={`${id}-status`}>{t('admin.flags.status')}</Label>
            <NativeSelect
              id={`${id}-status`}
              value={filters.status ?? ALL}
              onChange={(event) => {
                const parsed = flagStatusSchema.safeParse(event.target.value);
                setFilters({ ...filters, status: parsed.success ? parsed.data : null });
              }}
            >
              <option value={ALL}>{t('admin.flags.all')}</option>
              {Object.values(FlagStatus).map((status) => (
                <option key={status} value={status}>
                  {t(`admin.flags.statuses.${status}`)}
                </option>
              ))}
            </NativeSelect>
          </div>
        </div>
        <FlagList filters={filters} />
      </div>
    </>
  );
}

function FlagList({ filters }: { filters: FlagFilters }) {
  const { t } = useTranslation();
  const flags = useInfiniteQuery(adminFlagsQueryOptions(filters));
  const { hasNextPage, isFetchingNextPage, fetchNextPage } = flags;
  const loadMore = useCallback(() => {
    if (hasNextPage && !isFetchingNextPage) void fetchNextPage();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  if (flags.isPending) return <PageSpinner className="min-h-40" />;
  if (flags.isError) {
    return <QueryError error={flags.error} onRetry={() => void flags.refetch()} />;
  }
  const items = flags.data.pages.flatMap((page) => page.items);
  if (items.length === 0) return <p className="text-muted-foreground">{t('admin.flags.empty')}</p>;
  return (
    <div className="flex flex-col gap-4">
      <ul
        aria-label={t('admin.flags.listLabel')}
        aria-busy={flags.isPlaceholderData}
        className="grid gap-4 xl:grid-cols-2"
      >
        {items.map((flag) => (
          <li key={flag.id}>
            <FlagCard flag={flag} />
          </li>
        ))}
      </ul>
      {hasNextPage && (
        <LoadMore
          label={t('admin.flags.loadMore')}
          onLoad={loadMore}
          loading={isFetchingNextPage}
        />
      )}
    </div>
  );
}
