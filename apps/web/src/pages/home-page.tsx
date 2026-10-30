import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';

import { PageHeader } from '@/components/page-header';
import { PageSpinner } from '@/components/page-spinner';
import { QueryError } from '@/components/query-error';
import { HomeCards } from '@/features/home/home-cards';
import { homeQueryOptions } from '@/features/home/home-query';
import { LogToastButton } from '@/features/home/log-toast-button';

export function HomePage() {
  const { t } = useTranslation();
  const home = useQuery(homeQueryOptions);
  return (
    <>
      {/* No visible title on home; it still names the page and the browser tab. */}
      <PageHeader title={t('pages.home.title')} className="sr-only" />
      <div className="flex flex-col gap-4">
        {/* Usable before the counters load: logging never waits for /home. */}
        <LogToastButton />
        {home.isPending ? (
          <PageSpinner />
        ) : home.isError ? (
          <QueryError error={home.error} onRetry={() => void home.refetch()} />
        ) : (
          <HomeCards home={home.data} />
        )}
      </div>
    </>
  );
}
