import { useInfiniteQuery } from '@tanstack/react-query';
import { Search } from 'lucide-react';
import { useCallback, useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';

import { CLAN_SEARCH_MAX } from '@toasthub/shared';

import { LoadMore } from '@/components/load-more';
import { PageHeader } from '@/components/page-header';
import { PageSpinner } from '@/components/page-spinner';
import { QueryError } from '@/components/query-error';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { clanListQueryOptions } from '@/features/clans/clans-api';
import { SEARCH_DELAY_MS, useDebouncedValue } from '@/lib/use-debounced-value';

/** Every clan by name; each opens its admin page (SPEC §4.13). Uses the public clan list. */
export function AdminClansPage() {
  const { t } = useTranslation();
  const id = useId();
  const [input, setInput] = useState('');
  const search = useDebouncedValue(input.trim(), SEARCH_DELAY_MS);
  return (
    <>
      <PageHeader title={t('admin.nav.clans')} />
      <div className="flex flex-col gap-4">
        <div role="search" className="flex max-w-md flex-col gap-2">
          <Label htmlFor={`${id}-search`}>{t('clans.search')}</Label>
          <div className="relative">
            <Search
              className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <Input
              id={`${id}-search`}
              type="search"
              className="pl-9"
              maxLength={CLAN_SEARCH_MAX}
              placeholder={t('clans.searchPlaceholder')}
              value={input}
              onChange={(event) => {
                setInput(event.target.value);
              }}
            />
          </div>
        </div>
        <ClanList search={search} />
      </div>
    </>
  );
}

function ClanList({ search }: { search: string }) {
  const { t } = useTranslation();
  const clans = useInfiniteQuery(clanListQueryOptions(search));
  const { hasNextPage, isFetchingNextPage, fetchNextPage } = clans;
  const loadMore = useCallback(() => {
    if (hasNextPage && !isFetchingNextPage) void fetchNextPage();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  if (clans.isPending) return <PageSpinner className="min-h-40" />;
  if (clans.isError) {
    return <QueryError error={clans.error} onRetry={() => void clans.refetch()} />;
  }
  const items = clans.data.pages.flatMap((page) => page.items);
  if (items.length === 0) {
    return (
      <p className="text-muted-foreground">
        {search ? t('clans.noMatch', { search }) : t('admin.clans.empty')}
      </p>
    );
  }
  return (
    <div className="flex flex-col gap-4">
      <ul aria-busy={clans.isPlaceholderData} className="grid gap-3 lg:grid-cols-2 2xl:grid-cols-3">
        {items.map((clan) => (
          <li key={clan.id}>
            <Card className="relative h-full py-4 transition-colors focus-within:ring-[3px] focus-within:ring-ring/50 hover:bg-accent">
              <CardContent className="flex items-start justify-between gap-3 px-4">
                <div className="flex min-w-0 flex-col gap-1">
                  <Link
                    to={`/admin/clans/${clan.id}`}
                    className="font-semibold wrap-break-word outline-none after:absolute after:inset-0"
                  >
                    {clan.name}
                  </Link>
                  {clan.description && (
                    <p className="line-clamp-2 text-sm wrap-break-word text-muted-foreground">
                      {clan.description}
                    </p>
                  )}
                </div>
                <p className="shrink-0 text-sm text-muted-foreground tabular-nums">
                  {t('clans.memberCount', { count: clan.memberCount })}
                </p>
              </CardContent>
            </Card>
          </li>
        ))}
      </ul>
      {hasNextPage && (
        <LoadMore label={t('clans.loadMore')} onLoad={loadMore} loading={isFetchingNextPage} />
      )}
    </div>
  );
}
